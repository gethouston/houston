export const PREWARM_TYPING_MS = 1_500;

export const PREWARM_TYPING_GAP_MS = 1_000;

export interface DraftInstant {
  wall: number;
  mono: number;
}

export interface DraftTypingRun {
  target: string;
  startedMono: number;
  lastWall: number;
  lastMono: number;
}

export class DraftTypingRuns {
  private readonly runs = new Map<string, DraftTypingRun>();

  keystroke(
    draftKey: string,
    target: string,
    at: DraftInstant,
  ): DraftTypingRun {
    const run = this.runs.get(draftKey);
    if (run?.target === target) {
      const wallGap = at.wall - run.lastWall;
      const monoGap = at.mono - run.lastMono;
      if (
        wallGap >= 0 &&
        wallGap <= PREWARM_TYPING_GAP_MS &&
        monoGap <= PREWARM_TYPING_GAP_MS
      ) {
        run.lastWall = at.wall;
        run.lastMono = at.mono;
        return run;
      }
    }
    const started: DraftTypingRun = {
      target,
      startedMono: at.mono,
      lastWall: at.wall,
      lastMono: at.mono,
    };
    this.runs.set(draftKey, started);
    return started;
  }

  end(draftKey: string): void {
    this.runs.delete(draftKey);
  }

  entries(): [string, DraftTypingRun][] {
    return [...this.runs].map(([key, run]) => [key, { ...run }]);
  }

  adopt(entries: readonly [string, DraftTypingRun][]): void {
    for (const [key, run] of entries)
      if (!this.runs.has(key)) this.runs.set(key, { ...run });
  }
}

export function holdOf(answer: unknown): number {
  const holdMs =
    answer && typeof answer === "object"
      ? (answer as { holdMs?: unknown }).holdMs
      : undefined;
  return typeof holdMs === "number" && holdMs > 0 ? holdMs : 0;
}
