/**
 * Per-agent "still waking" bookkeeping for the stuck-wake escalation
 * (PRODUCT-1640). Dependency-free so it unit-tests under node:test
 * (app/tests/waking-stuck-tracker.test.ts); the executor is
 * `quiet-error-report.ts`.
 *
 * Every waking answer (HOU-1114 / PRODUCT-1403) is an expected state and is
 * captured only as a low-noise warning. But an agent that answers NOTHING but
 * waking for longer than the gateway's own 300s `ensureAwake` hold is no longer
 * "still starting": the pod is crashlooping or never scheduled, and that is a
 * bug we want as an error-level Sentry event — exactly ONE per stuck episode,
 * carrying the first and last raw bodies so the shape of the failure (a DNS
 * dial error turning into a refused connection, say) is readable from the
 * issue.
 *
 * An episode is a run of waking answers from one agent with no gap longer
 * than `gapMs` between consecutive answers: a burst hours apart is two cold
 * starts, not one stuck wake. Any successful call to the agent
 * (`noteSuccess`, fed by the gateway fetch) ends the episode outright.
 */

/** Above the gateway's 300s `ensureAwake` hold: a wake the gateway itself
 *  gave up on is the earliest point a client can call it stuck. */
export const WAKING_STUCK_THRESHOLD_MS = 5 * 60_000;

/** The longest silence between two waking answers that still counts as the
 *  same episode. Passive per-agent reads re-fire on events and focus, and
 *  each failing read spends up to ~15s in the transport's cold-start retry
 *  budget, so a healthy failing loop answers well inside this. */
export const WAKING_EPISODE_GAP_MS = 2 * 60_000;

export interface WakingStuck {
  agentKey: string;
  /** Raw body of the first waking answer of the episode. */
  firstBody: string;
  /** Raw body of the answer that crossed the threshold. */
  lastBody: string;
  /** How long the agent had been answering waking when it was called stuck. */
  sinceMs: number;
  /** Waking answers seen in the episode, this one included. */
  answers: number;
}

export interface WakingStuckTracker {
  /**
   * Record a waking answer. Returns the escalation exactly once per episode —
   * on the first answer past the threshold — and null otherwise.
   */
  noteWaking(agentKey: string, body: string, now: number): WakingStuck | null;
  /** A call to the agent succeeded: whatever episode was open is over. */
  noteSuccess(agentKey: string): void;
}

interface Episode {
  firstAt: number;
  lastAt: number;
  firstBody: string;
  answers: number;
  escalated: boolean;
}

export function createWakingStuckTracker(
  options: { thresholdMs?: number; gapMs?: number } = {},
): WakingStuckTracker {
  const thresholdMs = options.thresholdMs ?? WAKING_STUCK_THRESHOLD_MS;
  const gapMs = options.gapMs ?? WAKING_EPISODE_GAP_MS;
  const episodes = new Map<string, Episode>();
  return {
    noteWaking(agentKey, body, now) {
      const open = episodes.get(agentKey);
      const episode =
        open && now - open.lastAt <= gapMs
          ? open
          : {
              firstAt: now,
              lastAt: now,
              firstBody: body,
              answers: 0,
              escalated: false,
            };
      episode.lastAt = now;
      episode.answers += 1;
      episodes.set(agentKey, episode);
      // Evict episodes that have gone quiet, so the map only ever holds the
      // agents currently answering waking.
      for (const [key, e] of episodes) {
        if (now - e.lastAt > gapMs) episodes.delete(key);
      }
      if (episode.escalated || now - episode.firstAt < thresholdMs) return null;
      episode.escalated = true;
      return {
        agentKey,
        firstBody: episode.firstBody,
        lastBody: body,
        sinceMs: now - episode.firstAt,
        answers: episode.answers,
      };
    },
    noteSuccess(agentKey) {
      episodes.delete(agentKey);
    },
  };
}

/**
 * The process-wide tracker: waking answers are noted by the app's quiet-error
 * report (`quiet-error-report.ts`), successes by the gateway fetch
 * (`engine-adapter/cp/fetch.ts`), which is the one place that sees every
 * per-agent call land.
 */
export const wakingStuckTracker = createWakingStuckTracker();
