/** How long a person types without stopping before a prewarm starts. */
export const PREWARM_TYPING_MS = 1_500;

/** The longest pause between keystrokes that still counts as typing on. */
export const PREWARM_TYPING_GAP_MS = 1_000;

/**
 * One reading of two clocks. The wall clock goes on through system sleep but
 * can be set back or forward; the monotonic one is never set but stops while
 * the machine sleeps (`performance.now()` on macOS WebKit). A span measured
 * to start something is read on the monotonic clock, which no adjustment
 * lengthens; a span measured to end something must have passed on either.
 */
export interface DraftInstant {
  wall: number;
  mono: number;
}

/** One draft slot's typing without a pause past the gap. */
export interface DraftTypingRun {
  target: string;
  startedMono: number;
  lastWall: number;
  lastMono: number;
}

/** The typing runs of one policy's draft slots. */
export class DraftTypingRuns {
  private readonly runs = new Map<string, DraftTypingRun>();

  /** Extends the slot's run, or starts one on another target or after a
   *  pause past the gap on either clock: a sleep shows on the wall clock, and
   *  a wall clock set back leaves the pause unknown. */
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

  /** The slot's text emptied: its next keystroke starts a run. */
  end(draftKey: string): void {
    this.runs.delete(draftKey);
  }

  entries(): [string, DraftTypingRun][] {
    return [...this.runs].map(([key, run]) => [key, { ...run }]);
  }

  /** Takes over runs for every slot this instance has not typed in. */
  adopt(entries: readonly [string, DraftTypingRun][]): void {
    for (const [key, run] of entries)
      if (!this.runs.has(key)) this.runs.set(key, { ...run });
  }
}

/** The hold a prewarm answer reports; none for a skip or a shape it is not. */
export function holdOf(answer: unknown): number {
  const holdMs =
    answer && typeof answer === "object"
      ? (answer as { holdMs?: unknown }).holdMs
      : undefined;
  return typeof holdMs === "number" && holdMs > 0 ? holdMs : 0;
}
