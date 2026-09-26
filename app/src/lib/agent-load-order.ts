/** How a finished roster load lands. */
export type AgentLoadOutcome =
  /** The newest load: its result is the roster. */
  | "apply"
  /** Superseded by a newer load, which settles the loading flag itself. */
  | "drop"
  /**
   * Invalidated with no newer load behind it: its result is dropped, but the
   * loading flag it raised must still come down or every roster wait hangs.
   */
  | "drop-and-settle";

/** Orders roster loads so only the newest one's result lands. */
export interface AgentLoadOrder {
  /** A load starts; `silent` loads never raise the loading flag. */
  begin(silent: boolean): number;
  /** Rejects every load in flight (a mutation made their snapshots stale). */
  invalidate(): void;
  settle(load: number): AgentLoadOutcome;
}

export function createAgentLoadOrder(): AgentLoadOrder {
  let generation = 0;
  let lastBegun = { load: 0, silent: true };
  return {
    begin(silent) {
      generation += 1;
      lastBegun = { load: generation, silent };
      return generation;
    },
    invalidate() {
      generation += 1;
    },
    settle(load) {
      if (load === generation) return "apply";
      return load === lastBegun.load && !lastBegun.silent
        ? "drop-and-settle"
        : "drop";
    },
  };
}
