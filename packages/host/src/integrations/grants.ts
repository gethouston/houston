import type { AgentId, UserId } from "../domain/types";
import type { IntegrationGrantStore } from "./grant-store";
import type { IntegrationRegistry } from "./registry";
import type { ToolMatch } from "./types";
import { IntegrationSigninRequiredError } from "./types";

/**
 * LOCAL / self-host per-agent integration grants (the same policy the cloud
 * gateway serves in multiplayer, brought to single-player). NOT wired on managed
 * cloud pods: the gateway in front owns grants there, so the pod must not shadow
 * it (see local/host.ts — only constructed when NOT gateway-fronted).
 *
 * Default semantics preserve today's behavior (every agent can use every
 * connected app): the FIRST read of an agent with no record MATERIALIZES the
 * record as all toolkits the user currently has connected, persists it, and
 * enforcement begins from there. Provider not ready (signed out / unconfigured)
 * yields an empty set WITHOUT persisting, so a later signed-in read materializes
 * the real set.
 */

/**
 * Composio slug convention: an action is named `<TOOLKIT>_<REST>` with the
 * toolkit slug uppercased VERBATIM, so a multi-word slug keeps its underscores
 * (`google_maps` → `GOOGLE_MAPS_GET_ROUTE`, `gmail` → `GMAIL_SEND_EMAIL`). Attach
 * an action to a toolkit by matching the FULL slug as a prefix up to an
 * underscore boundary — never the segment before the first `_`, which would
 * mis-attribute `GOOGLE_MAPS_GET_ROUTE` to a nonexistent `google` toolkit and so
 * 403 a genuinely-granted `google_maps`. Search results carry the real `toolkit`
 * field; only execute (action slug only) needs this, and it matches against the
 * real granted slugs (which carry their underscores) rather than a fragile prefix.
 */
export function actionInToolkit(action: string, toolkit: string): boolean {
  const a = action.toLowerCase();
  const t = toolkit.toLowerCase();
  return a === t || a.startsWith(`${t}_`);
}

export type GrantValidation =
  | { ok: true; toolkits: string[] }
  | { ok: false; error: string };

const SLUG = /^[a-z0-9_-]+$/;

/** Validate + dedupe a replace-set PUT body: an array of plain toolkit slugs. */
export function normalizeToolkits(input: unknown): GrantValidation {
  if (!Array.isArray(input)) {
    return { ok: false, error: "missing 'toolkits' (array of strings)" };
  }
  const seen = new Set<string>();
  const toolkits: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string" || !SLUG.test(raw)) {
      return {
        ok: false,
        error: `invalid toolkit slug: ${JSON.stringify(raw)}`,
      };
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      toolkits.push(raw);
    }
  }
  return { ok: true, toolkits };
}

/**
 * Keep the matches whose toolkit is granted (case-insensitive) — plus every
 * match marked NOT connected. Grants only exist over connected toolkits, so a
 * `connected: false` match can never be granted; dropping it would kill the
 * in-chat connect discovery (HOU-670: search surfaces not-connected apps so
 * the agent can offer the connect card). Execute stays fully enforced — a
 * not-connected toolkit fails there regardless.
 */
export function filterMatchesToGranted(
  matches: ToolMatch[],
  granted: string[],
): ToolMatch[] {
  const set = new Set(granted.map((t) => t.toLowerCase()));
  return matches.filter(
    (m) => m.connected === false || set.has(m.toolkit.toLowerCase()),
  );
}

/** Is the action's toolkit in the granted set? Matches each granted slug as a
 *  full prefix (case-insensitive), so multi-word slugs like `google_maps` are
 *  neither 403'd (false prefix) nor confused with a shorter `google`. */
export function isActionGranted(action: string, granted: string[]): boolean {
  return granted.some((t) => actionInToolkit(action, t));
}

export class LocalIntegrationGrants {
  private readonly store: IntegrationGrantStore;
  private readonly registry: IntegrationRegistry;
  /** In-flight first-reads per agent, so concurrent GETs materialize once. */
  private readonly inflight = new Map<AgentId, Promise<string[]>>();

  constructor(deps: {
    store: IntegrationGrantStore;
    registry: IntegrationRegistry;
  }) {
    this.store = deps.store;
    this.registry = deps.registry;
  }

  /**
   * GET semantics: the agent's grant set, materializing the default on first read.
   * Concurrency-guarded — a second read racing the first shares its promise, so
   * the default is computed and persisted exactly once.
   */
  async read(agentId: AgentId, userId: UserId): Promise<string[]> {
    const existing = this.inflight.get(agentId);
    if (existing) return existing;
    const pending = this.readOrMaterialize(agentId, userId).finally(() =>
      this.inflight.delete(agentId),
    );
    this.inflight.set(agentId, pending);
    return pending;
  }

  private async readOrMaterialize(
    agentId: AgentId,
    userId: UserId,
  ): Promise<string[]> {
    const record = await this.store.get(agentId);
    if (record.stored) return record.toolkits;
    return this.materialize(agentId, userId);
  }

  /** All currently-connected toolkits (active or error, never pending) across the
   *  wired providers. Any provider not ready → [] WITHOUT persisting. */
  private async materialize(
    agentId: AgentId,
    userId: UserId,
  ): Promise<string[]> {
    const toolkits = new Set<string>();
    try {
      for (const id of this.registry.ids()) {
        const provider = this.registry.get(id);
        if (!(await provider.readiness()).ready) return [];
        for (const c of await provider.listConnections(userId)) {
          if (c.status === "active" || c.status === "error") {
            toolkits.add(c.toolkit);
          }
        }
      }
    } catch (err) {
      // A signed-out gateway throws instead of reporting not-ready — same
      // outcome: an empty set, unpersisted, materialized on a later signed-in read.
      if (err instanceof IntegrationSigninRequiredError) return [];
      throw err;
    }
    const list = [...toolkits];
    await this.store.put(agentId, list);
    return list;
  }

  /** Replace-set write (caller passes a validated, deduped set). */
  async replace(agentId: AgentId, toolkits: string[]): Promise<string[]> {
    await this.store.put(agentId, toolkits);
    return toolkits;
  }

  /**
   * Enforcement read (no materialization): the granted set when a record exists,
   * else null meaning "no record → do not filter" (backward compatibility).
   */
  async grantedOrNull(agentId: AgentId): Promise<string[] | null> {
    const record = await this.store.get(agentId);
    return record.stored ? record.toolkits : null;
  }
}
