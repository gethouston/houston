export type AgentLoadOutcome = "apply" | "drop" | "drop-and-settle";

export interface AgentLoadOrder {
  begin(silent: boolean): number;
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
