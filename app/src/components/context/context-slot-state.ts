export type ContextSlotState = "loading" | "noAgent" | "ready";

export function contextSlotState(input: {
  agentsLoaded: boolean;
  agentPath: string | undefined;
  hasData: boolean;
}): ContextSlotState {
  if (!input.agentPath) return input.agentsLoaded ? "noAgent" : "loading";
  return input.hasData ? "ready" : "loading";
}
