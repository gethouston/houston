/**
 * The Claude Agent SDK emits a process warning on EVERY `query()` because
 * Houston pre-approves its own in-process MCP tools: bare `allowedTools`
 * entries auto-approve a tool before `canUseTool` is consulted, so the SDK
 * points out that the callback will not see them.
 *
 * That is the design, not a defect. Those tools are Houston's own handlers,
 * running in this process with no filesystem reach for the permission gate to
 * clamp (backends/claude/custom-tools.ts), and the gate exists for the SDK's
 * built-in file tools, which are NOT in `allowedTools` and still go through it.
 *
 * Left alone, Node prints the warning to stderr once per turn, where the log
 * stamps it ERROR - dozens of red lines a day saying nothing, which is how a
 * real error learns to hide. So the process's warning handling is taken over
 * once: this one warning is reported ONCE, at INFO, and every other warning
 * (deprecations included) is handed to the handlers Node had installed, so
 * nothing else is silenced.
 */

/** The SDK's own code for the pre-approval notice. */
const SHADOWED_WARNING_CODE = "CLAUDE_SDK_CAN_USE_TOOL_SHADOWED";

let installedFilter = false;

/**
 * Take over process warnings for this runtime. Idempotent, and called when the
 * Claude backend is built, so a process that never speaks to Anthropic keeps
 * Node's warning behaviour untouched.
 */
export function installClaudeSdkWarningFilter(): void {
  if (installedFilter) return;
  installedFilter = true;
  // Node's own stderr printer is an ordinary listener; capturing it here and
  // replaying it below is what keeps every OTHER warning visible.
  const inherited = process.listeners("warning");
  process.removeAllListeners("warning");
  let reported = false;
  process.on("warning", (warning: Error & { code?: string }) => {
    if (warning.code !== SHADOWED_WARNING_CODE) {
      for (const listener of inherited) listener(warning);
      return;
    }
    if (reported) return;
    reported = true;
    console.info(
      "[claude] the SDK pre-approves Houston's own tools, so its permission callback does not see them; its per-turn notice is reported here once.",
    );
  });
}
