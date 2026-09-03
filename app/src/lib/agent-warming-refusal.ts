// The app's OWN "not yet" refusal, told apart structurally so the reporting
// layer can recognize it without importing the guard (`agent-warming-guard.ts`
// pulls the provisioning store, which pulls the reporting layer back — a
// cycle). Dependency-free, node-testable (app/tests/agent-warming-refusal.test.ts).
//
// `blockWriteWhileWarming` (HOU-693) opens the "your agent is almost ready"
// dialog and throws this error to abort a user-initiated write against an
// engine still warming up. The dialog IS the surface: the global rejection
// handler already declines it, but a caller's own catch that funnels every
// failure through `genericErrorDescription` / `showErrorToast` re-surfaced it
// as a red "couldn't start" toast plus a Sentry error whose message was the
// dialog's localized copy (HOUSTON-APP-53K). Nothing failed and nothing is to
// fix, so the reporting layer drops it — logged for the local tail only.

export const AGENT_WARMING_ERROR_NAME = "AgentWarmingError";

/** True for the warming guard's refusal, whichever module minted it. */
export function isAgentWarmingRefusal(err: unknown): boolean {
  return err instanceof Error && err.name === AGENT_WARMING_ERROR_NAME;
}
