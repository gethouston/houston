import type { AgentId, UserId } from "../domain/types";
import type { GrantAccount, IntegrationGrantStore } from "./grant-store";
import type { IntegrationRegistry } from "./registry";
import { IntegrationSigninRequiredError } from "./types";

/**
 * LOCAL / self-host per-agent integration grants (the same policy the cloud
 * gateway serves in multiplayer, brought to single-player). NOT wired on managed
 * cloud pods: the gateway in front owns grants there, so the pod must not shadow
 * it (see local/host.ts — only constructed when NOT gateway-fronted).
 *
 * The grant unit is a connected ACCOUNT (`connectionId` + its `toolkit`). Default
 * semantics preserve today's behavior (every agent can use every connected app):
 * the FIRST read of an agent with no record MATERIALIZES the record as all
 * accounts the user currently has connected, persists it, and enforcement begins
 * from there. A legacy `{ toolkits }` file materializes the connected accounts of
 * exactly those toolkits (a one-time upgrade). Provider not ready (signed out /
 * unconfigured) yields an empty set WITHOUT persisting, so a later signed-in read
 * materializes the real set.
 *
 * Pure policy helpers live in ./grant-policy.
 */
export class LocalIntegrationGrants {
  private readonly store: IntegrationGrantStore;
  private readonly registry: IntegrationRegistry;
  /** In-flight first-reads per agent, so concurrent GETs materialize once. */
  private readonly inflight = new Map<AgentId, Promise<GrantAccount[]>>();

  constructor(deps: {
    store: IntegrationGrantStore;
    registry: IntegrationRegistry;
  }) {
    this.store = deps.store;
    this.registry = deps.registry;
  }

  /**
   * GET semantics: the agent's granted accounts, materializing the default on
   * first read. Concurrency-guarded — a second read racing the first shares its
   * promise, so the default is computed and persisted exactly once.
   */
  async read(agentId: AgentId, userId: UserId): Promise<GrantAccount[]> {
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
  ): Promise<GrantAccount[]> {
    const record = await this.store.get(agentId);
    if (record.stored)
      return this.pruneToLive(agentId, userId, record.accounts);
    return this.materialize(agentId, userId, record.legacyToolkits);
  }

  /**
   * All currently-connected accounts (active or error, never pending) across the
   * wired providers, or null when any provider is not ready (signed out /
   * unconfigured) so callers can distinguish "no accounts" from "can't tell".
   */
  private async liveAccounts(userId: UserId): Promise<GrantAccount[] | null> {
    const accounts: GrantAccount[] = [];
    for (const id of this.registry.ids()) {
      const provider = this.registry.get(id);
      if (!(await provider.readiness()).ready) return null;
      for (const c of await provider.listConnections(userId)) {
        if (c.status !== "active" && c.status !== "error") continue;
        accounts.push({ connectionId: c.connectionId, toolkit: c.toolkit });
      }
    }
    return accounts;
  }

  /**
   * Materialize the default (all currently-connected accounts), optionally
   * narrowed to a legacy toolkit set (upgrade path). Any provider not ready → []
   * WITHOUT persisting (materialized on a later signed-in read).
   */
  private async materialize(
    agentId: AgentId,
    userId: UserId,
    legacyToolkits?: string[],
  ): Promise<GrantAccount[]> {
    let live: GrantAccount[] | null;
    try {
      live = await this.liveAccounts(userId);
    } catch (err) {
      // A signed-out gateway throws instead of reporting not-ready — same
      // outcome: an empty set, unpersisted, materialized on a later signed-in read.
      if (err instanceof IntegrationSigninRequiredError) return [];
      throw err;
    }
    if (!live) return [];
    const legacy = legacyToolkits
      ? new Set(legacyToolkits.map((t) => t.toLowerCase()))
      : null;
    const accounts = legacy
      ? live.filter((a) => legacy.has(a.toolkit.toLowerCase()))
      : live;
    await this.store.put(agentId, accounts);
    return accounts;
  }

  /**
   * Self-heal a stored record: drop granted accounts the user has since
   * disconnected (an id absent from the live set), persisting the pruned set.
   * A disconnected account otherwise lingers in the record forever, so every
   * replace-set PUT that echoes it back 400s against the live-connection check.
   * Provider not ready → keep the record verbatim (never wipe on a blind read).
   */
  private async pruneToLive(
    agentId: AgentId,
    userId: UserId,
    accounts: GrantAccount[],
  ): Promise<GrantAccount[]> {
    let live: GrantAccount[] | null;
    try {
      live = await this.liveAccounts(userId);
    } catch (err) {
      if (err instanceof IntegrationSigninRequiredError) return accounts;
      throw err;
    }
    if (!live) return accounts;
    const liveIds = new Set(live.map((a) => a.connectionId));
    const kept = accounts.filter((a) => liveIds.has(a.connectionId));
    if (kept.length !== accounts.length) await this.store.put(agentId, kept);
    return kept;
  }

  /** Replace-set write (caller passes a validated, deduped set). */
  async replace(
    agentId: AgentId,
    accounts: GrantAccount[],
  ): Promise<GrantAccount[]> {
    await this.store.put(agentId, accounts);
    return accounts;
  }

  /**
   * Enforcement read: the granted accounts when a record exists, else null
   * meaning "no record → do not filter" (backward compat). A legacy `{ toolkits }`
   * file is NOT no-record — it carried a real restriction, so returning null here
   * would silently drop enforcement (fail open) for the whole window until a
   * grants GET happens to run. It is materialized (guarded + persisted, exactly
   * like read()) into its restricted account set so the sandbox enforces from the
   * first turn.
   */
  async grantedOrNull(
    agentId: AgentId,
    userId: UserId,
  ): Promise<GrantAccount[] | null> {
    const record = await this.store.get(agentId);
    if (record.stored) return record.accounts;
    if (record.legacyToolkits) return this.read(agentId, userId);
    return null;
  }
}
