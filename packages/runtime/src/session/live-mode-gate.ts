import { currentTurnMode } from "./turn-mode-context";

/**
 * Execute-time mode gates for the mid-turn Mode-pill switch (Claude Code's
 * shift+tab semantics). A session's TOOLSET is fixed at build time
 * (tool-selection.ts / the Claude tool policy), so when the user switches mode
 * WHILE the agent works, the model still sees the old mode's tools — these
 * gates are how the new mode takes effect anyway: each restricted tool checks
 * the LIVE mode when it actually runs and refuses with a message that tells
 * the model what changed and what to do instead.
 *
 * Only the RESTRICTIVE direction is enforceable mid-turn (execute/auto → plan
 * blocks acting; execute → auto blocks waiting). The permissive direction
 * (plan → execute) cannot conjure tools into a running session — it takes
 * full effect on the next turn, when the pin rebuilds the session. Same
 * trade-off Claude Code makes.
 *
 * Outside a turn (unit tests calling a tool directly) `currentTurnMode()` is
 * undefined and every gate is a no-op. Known hole: pi's built-in `bash` runs
 * outside our custom-tool wrappers, so a mid-turn flip to plan cannot stop an
 * in-flight bash-capable session from running commands until the turn ends —
 * the next turn's rebuilt session drops bash entirely.
 */

/** Throw when the LIVE mode is plan: the model must stop acting and plan. */
export function assertNotPlanMode(couldNot: string): void {
  if (currentTurnMode() !== "plan") return;
  throw new Error(
    `The user just switched this conversation to Plan mode, so you can no longer ${couldNot}. Stop acting now: summarize what you already did, then lay out the remaining work as a clear step-by-step plan in plain language for the user to approve, and end your turn.`,
  );
}

/** Throw when the LIVE mode is auto: the model must not wait on the user. */
export function assertNotAutoMode(couldNot: string): void {
  if (currentTurnMode() !== "auto") return;
  throw new Error(
    `The user just switched this conversation to Autopilot mode, so you can no longer ${couldNot}. Do not wait on the user: make the most sensible choice yourself and keep going, note any important assumptions, and finish with a short report of what you did and anything that needs their attention.`,
  );
}
