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
 * Kept dependency-free so `node --test` can exercise it directly.
 */

/**
 * Small, always-present, side-effect-free per-agent read. This is the typed
 * config doc path (`data/config.ts` / `readAgentJson("config")`) — if that
 * layout ever moves, update this constant with it, or every probe resolves
 * "ready" instantly off the 404 and the provisioning state never shows.
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

export interface ProvisioningEntry {
  agentId: string;
  /** What the engine client addresses the agent by (`agent.folderPath`). */
  agentPath: string;
  /** Epoch ms of the create call — the TTL anchor. */
  since: number;
}

/**
 * True when a failed probe means "the engine isn't answering yet, keep
 * waiting": a gateway 502/503/504 (still warming / rolling deploy) or a
 * transport-level failure with no HTTP verdict at all. Any definitive HTTP
 * answer — 200, 404 (file or agent gone), 401 — proves something responded
 * for this agent, so the "being created" state is over either way; if what
 * responded is broken, the user's own requests surface the real error.
 */
export function probeSaysStillStarting(err: unknown): boolean {
  if (!err || typeof err !== "object") return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== "number") return true;
  return status === 502 || status === 503 || status === 504;
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
  return parsed.filter((e): e is ProvisioningEntry => {
    if (!e || typeof e !== "object") return false;
    const { agentId, agentPath, since } = e as Partial<ProvisioningEntry>;
    return (
      typeof agentId === "string" &&
      typeof agentPath === "string" &&
      typeof since === "number" &&
      now - since < PROVISIONING_TTL_MS
    );
  });
}

export interface ProbeDeps {
  /** The readiness read — resolves once the agent's engine answers. */
  readFile: (agentPath: string, relPath: string) => Promise<unknown>;
  /** True while this probe's entry is still current (loop exit switch). */
  isMarked: (agentId: string) => boolean;
  /** Engine answered (with anything) — the agent is reachable. */
  onReady: (agentId: string) => void;
  /** TTL elapsed without the engine ever answering. */
  onTimeout: (agentId: string, lastError: unknown) => void;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
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
  const initialRemaining = entry.since + PROVISIONING_TTL_MS - deps.now();
  // One deadline for the whole probe, anchored to the create call. Left
  // pending when the probe wins — a settled timer with no listeners is free.
  const deadline = deps
    .sleep(Math.max(initialRemaining, 0))
    .then(() => "timeout" as const);
  while (deps.isMarked(entry.agentId)) {
    if (deps.now() - entry.since >= PROVISIONING_TTL_MS) {
      deps.onTimeout(entry.agentId, lastError);
      return;
    }
    // The attempt never rejects (failures fold into a verdict), so losing the
    // race can't leave an unhandled rejection behind.
    const attempt = deps
      .readFile(entry.agentPath, PROVISIONING_PROBE_FILE)
      .then(
        () => "ready" as const,
        (err) => {
          lastError = err;
          return probeSaysStillStarting(err)
            ? ("still-starting" as const)
            : ("ready" as const);
        },
      );
    const outcome = await Promise.race([attempt, deadline]);
    if (outcome === "timeout") {
      deps.onTimeout(entry.agentId, lastError);
      return;
    }
    if (outcome === "ready") {
      deps.onReady(entry.agentId);
      return;
    }
    await deps.sleep(PROVISIONING_RETRY_MS);
  }
}
