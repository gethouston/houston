export const WAKING_STUCK_THRESHOLD_MS = 5 * 60_000;

export const WAKING_EPISODE_GAP_MS = 2 * 60_000;

export interface WakingStuck {
  agentKey: string;
  firstBody: string;
  lastBody: string;
  sinceMs: number;
  answers: number;
}

export interface WakingStuckTracker {
  noteWaking(agentKey: string, body: string, now: number): WakingStuck | null;
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

export const wakingStuckTracker = createWakingStuckTracker();
