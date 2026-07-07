import type { TurnMode } from "@houston/protocol";

/**
 * Plan mode's system-prompt overlay. Appended (LAST, after the agent's own
 * context) to whatever system prompt a session would otherwise carry, on a
 * "plan" turn only. It turns the agent read-only in spirit — the read-only TOOL
 * subset (session/tool-selection.ts + the Claude tool policy) enforces it in
 * fact; this overlay tells the model WHY and shapes the output into a plan the
 * user approves before anything is done.
 *
 * Voice: the target user is non-technical (see the product prompt rules), so the
 * overlay names no files, JSON, CLIs, or tools — it speaks in plain outcomes.
 */
export const PLAN_MODE_OVERLAY = [
  "You are in Plan mode. Here you help the user think through and design an approach before anything is actually done.",
  "",
  "- Look into whatever you need to understand the request fully. You may look at the user's information, but you must not change anything, and you must not use the user's connected apps or take any real-world action.",
  "- Do not create, edit, or delete anything. If you find yourself wanting to act, describe what you would do instead of doing it.",
  "- Work out a clear, step-by-step plan: what you understand the goal to be, the approach you recommend, the steps involved, and anything the user needs to decide.",
  "- Write the plan in plain, friendly language the user can follow. Keep it concrete and specific to their situation.",
  "- Finish by presenting the plan and asking the user to review it, so they can approve it or ask for changes before you carry it out.",
].join("\n");

/**
 * Autopilot mode's system-prompt overlay. Appended (LAST, after the agent's own
 * context) on an "auto" turn only. Auto is fire-and-forget: the model CANNOT
 * block on the user — the blocking tools (`ask_user`, `request_connection`) are
 * withheld from its toolset (session/tool-selection.ts) — so this overlay tells
 * it to act on its own judgment and report back.
 *
 * Voice: same non-technical rule as the plan overlay — no files, JSON, or CLIs.
 */
export const AUTO_MODE_OVERLAY = [
  "You are in Autopilot mode. The user has handed you this task and stepped away; they expect to come back to a finished result.",
  "",
  "- Do not ask the user questions or wait for their input. Work with the information you have.",
  "- When something is ambiguous, make the most sensible choice and keep going. Remember the important assumptions you make.",
  "- If something is truly out of reach (for example an app that is not connected), do the rest of the task and say clearly what you could not do and why.",
  "- Finish with a short report: what you did, what you assumed, and anything that needs the user's attention.",
].join("\n");

/**
 * Append the mode's system-prompt overlay: the plan overlay on a "plan" turn,
 * the Autopilot overlay on an "auto" turn, and an "execute" (or absent) mode
 * passes the prompt through unchanged. Both backends call this with the overlay
 * LAST so it sits after the workspace context file.
 */
export function withModeOverlay(systemPrompt: string, mode?: TurnMode): string {
  if (mode === "plan") return `${systemPrompt}\n\n${PLAN_MODE_OVERLAY}`;
  if (mode === "auto") return `${systemPrompt}\n\n${AUTO_MODE_OVERLAY}`;
  return systemPrompt;
}
