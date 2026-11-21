export type ModelPhase =
  | {
      phase: "requesting";
      provider: string;
      afterMs?: number;
      promptTokens?: number;
    }
  | { phase: "responding" }
  | { phase: "idle" };
