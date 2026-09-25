/**
 * The readiness long-poll for a warming AI Employee (HOU-693). The platform
 * guarantees any per-agent request is held until the engine is reachable and
 * then answered, so a cheap side-effect-free read doubles as the probe.
 */

import { PROVISIONING_TTL_MS, type ProvisioningEntry } from "./entry.ts";

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
