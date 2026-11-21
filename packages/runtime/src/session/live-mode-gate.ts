import { currentTurnMode } from "./turn-mode-context";

export function assertNotPlanMode(couldNot: string): void {
  if (currentTurnMode() !== "plan") return;
  throw new Error(
    `The user just switched this conversation to Plan mode, so you can no longer ${couldNot}. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.`,
  );
}

export function assertNotAutoMode(couldNot: string): void {
  if (currentTurnMode() !== "auto") return;
  throw new Error(
    `The user just switched this conversation to Autopilot mode, so you can no longer ${couldNot}. Do not wait on the user: make the most sensible choice yourself and keep going, note any important assumptions, and finish with a short report of what you did and anything that needs their attention.`,
  );
}
