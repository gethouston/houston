import { ENGINE_RESTART_MESSAGE, ENGINE_RESUMED_MESSAGE } from "@houston/sdk";

/**
 * Which engine-restart line a system message is, or undefined when it is any
 * other system note.
 *
 * The SDK authors these two lines in English (it is surface-agnostic and has
 * no `t()`), and both the live settle and the history replay push them as
 * plain `system_message` content. The app recognizes them by value and renders
 * the TRANSLATED copy instead — matching on the constant, never on a substring,
 * so a note that merely mentions a restart is untouched.
 */
export type EngineRestartLine = "sayContinue" | "resuming";

export function engineRestartLine(
  content: string,
): EngineRestartLine | undefined {
  if (content === ENGINE_RESTART_MESSAGE) return "sayContinue";
  if (content === ENGINE_RESUMED_MESSAGE) return "resuming";
  return undefined;
}
