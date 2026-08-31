/**
 * Pure logic for the "your agent is still being created" state (HOU-693).
 *
 * On the hosted profile, creating an agent answers immediately while its
 * engine warms up in the background (HOU-649) — the warm-up can take a couple
 * of minutes, and the platform gives the client no readiness field or event.
 * What it DOES guarantee: any per-agent request is held until the engine is
 * reachable and then answered, so a cheap side-effect-free read doubles as a
 * readiness long-poll. This module owns that probe loop plus the persistence
 * shape; the Zustand store (`stores/agent-provisioning.ts`) wires it to the
 * real engine client, toast, and localStorage.
 *
 * Kept dependency-free so `node --test` can exercise it directly: the imports
 * below are a type (erased at runtime) and the pure key factory.
 */

import type { MessageMention } from "@houston-ai/engine-client";
import { queryKeys } from "./query-keys.ts";

/**
 * Small, always-present, side-effect-free per-agent read. This is the typed
 * config doc path (`data/config.ts` / `readAgentJson("config")`). A missing
 * file answers 200 with empty content (`routes/agent-file.ts`), so the
 * probe's verdict keys on reachability alone — the only 404 an agent-scoped
 * read can produce is "agent not found" (see {@link probeSaysAgentGone}).
 */
export const PROVISIONING_PROBE_FILE = ".houston/config/config.json";

/** Pause between probe attempts that came back "engine not up yet". */
export const PROVISIONING_RETRY_MS = 3_000;

/**
 * How long a creation may stay "in progress" before we call it failed. A cold
 * start is minutes at the very worst; past this the user deserves an error,
 * not an eternal spinner.
 */
export const PROVISIONING_TTL_MS = 10 * 60_000;

/**
 * How long the asleep-check waits before calling the engine asleep (HOU-730).
 * An awake engine answers the tiny probe read in well under a second; a pod
 * scaled to zero is held by the gateway for its whole cold start.
 */
export const ASLEEP_DETECT_TIMEOUT_MS = 2_000;

export interface AsleepDetectDeps {
  /** The same cheap per-agent read the readiness probe uses. */
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
}

/**
 * One-shot asleep check for an EXISTING agent (HOU-730). A hosted pod scaled
 * to zero holds every per-agent request for its whole cold start — a first
 * message sent then hangs with no bubble and dies with a reload. Asleep =
 * the probe read is still held past the window, or the gateway answered a
 * warm-up status (502/503/504). A fast transport failure is NOT asleep: the
 * user's own request should surface the real network error instead of
 * silently parking messages for an engine that isn't coming.
 */
export async function detectEngineAsleep(
  agentPath: string,
  deps: AsleepDetectDeps,
): Promise<boolean> {
  const attempt = deps.readFile(agentPath, PROVISIONING_PROBE_FILE).then(
    () => false,
    (err) => {
      const status = (err as { status?: unknown } | null)?.status;
      return status === 502 || status === 503 || status === 504;
    },
  );
  const timer = deps.sleep(ASLEEP_DETECT_TIMEOUT_MS).then(() => true);
  return Promise.race([attempt, timer]);
}

/**
 * A message sent while the engine was still warming up. The wire send is NOT
 * fired then (a held request dies with load-balancer timeouts or a reload) —
 * the message shows as a local bubble and the real send fires the moment the
 * readiness probe clears. Persisted with the entry so a relaunch mid-warm-up
 * still delivers it. Attachments can't persist: after a relaunch the send
 * falls back to `text`.
 */
export interface PendingWarmingSend {
  /** Unique per queued message — keys its in-memory prompt builder. */
  id: string;
  sessionKey: string;
  /** What the user typed — the bubble, and the fallback wire prompt. */
  text: string;
  /**
   * Board row to (up)create right before this send — carried by the FIRST
   * message of a new conversation. Writing it at flush time (engine awake,
   * id-upsert idempotent) is the only way it survives: a write fired during
   * the warm-up is a held request that dies with a reload.
   */
  row?: {
    id: string;
    title: string;
    description: string;
    agent?: string;
    provider?: string;
    model?: string;
    /**
     * Status the row should land with (default `running`). The create route
     * can't carry it, so the flush patches it right after the create. The
     * welcome mission settles its queued row to `needs_you` when the
     * greeting reveals (HOU-713).
     */
    status?: string;
  };
  /**
   * A row-only entry (HOU-713): the board row IS the payload — no bubble, no
   * wire send at flush. Carried by the welcome mission, whose greeting is
   * client-rendered.
   */
  rowOnly?: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  /** Per-turn mode pin (composer "Mode" selector), forwarded at flush time. */
  mode?: "execute" | "plan" | "auto";
  /** Teammates this message @mentions (HOU-944). Plain JSON, so it survives
   *  the localStorage mirror and a relaunch mid-warm-up alongside the text. */
  mentions?: MessageMention[];
  /** Epoch ms the message was queued — orders the optimistic board rows. */
  queuedAt?: number;
  /**
   * Source text for the async AI title pass, carried only when the caller
   * wanted one (no explicit title). The pass can't run at queue time — the
   * engine can't answer — so the flush fires it after the row lands (HOU-713).
   */
  titleText?: string;
}

export interface ProvisioningEntry {
  agentId: string;
  /** What the engine client addresses the agent by (`agent.folderPath`). */
  agentPath: string;
  /** Epoch ms of the create call — the TTL anchor. */
  since: number;
  /**
   * Why the agent is warming. `"create"` = a just-created agent (HOU-693):
   * it has no data by definition, so per-agent reads may answer "nothing
   * yet" instantly. `"asleep"` = an EXISTING agent whose pod was detected
   * scaled-to-zero on open (HOU-730): it HAS data — the locally persisted
   * list/transcript caches are already painting it — so reads must NOT
   * short-circuit to empty (an instant empty success wipes the painted
   * cards AND the on-disk cache); they ride the gateway hold instead and
   * settle when the pod wakes. Absent on entries persisted by older builds:
   * treated as `"create"` (the pre-split behavior).
   */
  reason?: "create" | "asleep";
  /** Messages queued while warming, flushed on ready (in order). */
  pendingSends?: PendingWarmingSend[];
  /**
   * The TTL elapsed with no answer yet (HOU-693 regression: the entry used to
   * be cleared here, silently dropping the user's still-visible first chat).
   * Sticky once set — the store re-arms a fresh probe window on it rather
   * than giving up, and the UI switches to a "still starting" state instead
   * of the initial "we're creating your agent" copy. Never cleared back to
   * false; a fresh entry (new create/rename) replaces it instead.
   */
  timedOut?: boolean;
}

/**
 * Whether per-agent READS may answer "nothing yet" for this warming entry
 * instead of riding the gateway hold. Only a just-created agent qualifies —
 * see the `reason` doc above. Writes are unaffected (they always park or
 * block, whatever the reason).
 */
export function warmingReadsAnswerEmpty(entry: ProvisioningEntry): boolean {
  return entry.reason !== "asleep";
}

/**
 * True when a failed probe means "the engine isn't answering yet, keep
 * waiting": a gateway 502/503/504 (still warming / rolling deploy) or a
 * transport-level failure with no HTTP verdict at all. Any other definitive
 * HTTP answer — 200, 401, 500 — proves something responded for this agent, so
 * the "being created" state is over either way; if what responded is broken,
 * the user's own requests surface the real error. A 404 is NOT "responded":
 * see {@link probeSaysAgentGone}.
 */
export function probeSaysStillStarting(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== "number") return true;
  return status === 502 || status === 503 || status === 504;
}

/**
 * True when a failed probe means "the server no longer knows this agent"
 * (HOUSTON-APP-4ZF). The probe read has exactly one 404 path: the
 * gateway/host resolves the agent id before anything else and answers
 * `404 { error: "agent not found" }` when it doesn't — a missing probe FILE
 * answers 200 with empty content (`routes/agent-file.ts`), never 404. So a
 * 404 here is the write-path twin of `isAgentGoneError`: the LOCAL ROSTER IS
 * STALE (the agent was deleted or unshared elsewhere while a warming entry —
 * possibly rehydrated from the localStorage mirror after a relaunch — still
 * tracked it). Treating it as "ready" flushed the queued sends into the same
 * 404 (`create_activity: agent not found` in Sentry, a red mission-row toast)
 * for a state the user can't act on; the honest surface is a healed roster
 * and a silently dropped entry.
 */
export function probeSaysAgentGone(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}

/** Parse the persisted map, dropping expired and malformed entries. */
export function parsePersistedProvisioning(
  raw: string | null,
  now: number,
): ProvisioningEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((e): e is ProvisioningEntry => {
      if (!e || typeof e !== "object") return false;
      const { agentId, agentPath, since, timedOut } =
        e as Partial<ProvisioningEntry>;
      return (
        typeof agentId === "string" &&
        typeof agentPath === "string" &&
        typeof since === "number" &&
        // A timed-out entry is kept regardless of age: it's still visibly
        // parked (its board row / chat bubble persists) and re-arms its own
        // probe on rehydrate rather than expiring off the TTL clock a second
        // time, which would silently drop it right back.
        (timedOut === true || now - since < PROVISIONING_TTL_MS)
      );
    })
    .map((e) =>
      Array.isArray(e.pendingSends)
        ? {
            ...e,
            pendingSends: e.pendingSends.filter(
              (s): s is PendingWarmingSend =>
                !!s &&
                typeof s === "object" &&
                typeof (s as PendingWarmingSend).id === "string" &&
                typeof (s as PendingWarmingSend).sessionKey === "string" &&
                typeof (s as PendingWarmingSend).text === "string",
            ),
          }
        : e,
    );
}

/**
 * The query keys a completed warm-up must refetch BEFORE its optimistic rows
 * are dropped (HOU-713), so the board hands off to the real rows the flush
 * wrote without a one-frame gap.
 *
 * The FIRST is the whole point and the one that regressed: the boards read the
 * cross-agent sweep, whose key embeds every agent's path
 * (`["all-conversations", ...paths]`), so only the PREFIX matches the roster
 * variant the open board is mounted on. Invalidating the per-agent
 * `["activity", path]` alone refetched nothing any board shows, and the
 * optimistic rows vanished until the sweep independently returned.
 *
 * `["activity", path]` still belongs here: the per-agent surfaces that read it
 * live (the agent chat panel, the skill / routine / integration setup chats,
 * agent-admin knowledge) must see the flushed rows too.
 */
export function warmingFlushRefetchKeys(
  agentPath: string,
): readonly (readonly unknown[])[] {
  return [queryKeys.allConversations([]), queryKeys.activity(agentPath)];
}

export interface ProbeDeps {
  /** The readiness read — resolves once the agent's engine answers. */
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  /** True while this probe's entry is still current (loop exit switch). */
  isMarked: (agentId: string) => boolean;
  /** Engine answered (with anything) — the agent is reachable. */
  onReady: (agentId: string) => void;
  /** The server no longer knows the agent ({@link probeSaysAgentGone}):
   *  drop the entry and heal the roster instead of flushing. */
  onGone: (agentId: string, err: unknown) => void;
  /** TTL elapsed without the engine ever answering. */
  onTimeout: (agentId: string, error: ProvisioningTimeoutError) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

/**
 * The probe's TTL elapsed. Always a real Error with a diagnostic message: the
 * pod may have NEVER answered (every attempt held open server-side), in which
 * case there is no "last error" to forward — reporting that raw value gave
 * Sentry a bare `undefined` with nothing to triage on.
 */
export class ProvisioningTimeoutError extends Error {
  readonly attempts: number;
  readonly heldOpen: boolean;
  constructor(attempts: number, lastError: unknown) {
    const heldOpen = lastError === undefined;
    const last = heldOpen
      ? "the last attempt was still held open, the engine never answered"
      : `last failure: ${describeProbeFailure(lastError)}`;
    super(
      `engine did not answer within ${PROVISIONING_TTL_MS / 60_000} min (${attempts} attempts; ${last})`,
      { cause: lastError },
    );
    this.name = "ProvisioningTimeoutError";
    this.attempts = attempts;
    this.heldOpen = heldOpen;
  }
}

function describeProbeFailure(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number"
      ? `HTTP ${status} ${err.message}`
      : `${err.name}: ${err.message}`;
  }
  return String(err);
}

/**
 * Long-poll the agent until its engine answers, the TTL runs out, or the
 * caller unmarks it. Each attempt may itself hang for minutes (held
 * server-side until the engine is reachable), so the TTL races the in-flight
 * read too — a wedged attempt must not postpone the timeout toast forever.
 */
export async function runProvisioningProbe(
  entry: ProvisioningEntry,
  deps: ProbeDeps,
): Promise<void> {
  let lastError: unknown;
  let attempts = 0;
  const initialRemaining = entry.since + PROVISIONING_TTL_MS - deps.now();
  // One deadline for the whole probe, anchored to the create call. Left
  // pending when the probe wins — a settled timer with no listeners is free.
  const deadline = deps
    .sleep(Math.max(initialRemaining, 0))
    .then(() => "timeout" as const);
  while (deps.isMarked(entry.agentId)) {
    if (deps.now() - entry.since >= PROVISIONING_TTL_MS) {
      deps.onTimeout(
        entry.agentId,
        new ProvisioningTimeoutError(attempts, lastError),
      );
      return;
    }
    attempts++;
    // The attempt never rejects (failures fold into a verdict), so losing the
    // race can't leave an unhandled rejection behind.
    const attempt = deps
      .readFile(entry.agentPath, PROVISIONING_PROBE_FILE)
      .then(
        () => "ready" as const,
        (err) => {
          lastError = err;
          if (probeSaysAgentGone(err)) return "gone" as const;
          return probeSaysStillStarting(err)
            ? ("still-starting" as const)
            : ("ready" as const);
        },
      );
    const outcome = await Promise.race([attempt, deadline]);
    if (outcome === "timeout") {
      deps.onTimeout(
        entry.agentId,
        new ProvisioningTimeoutError(attempts, lastError),
      );
      return;
    }
    if (outcome === "gone") {
      deps.onGone(entry.agentId, lastError);
      return;
    }
    if (outcome === "ready") {
      deps.onReady(entry.agentId);
      return;
    }
    await deps.sleep(PROVISIONING_RETRY_MS);
  }
}
