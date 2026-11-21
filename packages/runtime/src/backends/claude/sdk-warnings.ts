const SHADOWED_WARNING_CODE = "CLAUDE_SDK_CAN_USE_TOOL_SHADOWED";

let installedFilter = false;

export function installClaudeSdkWarningFilter(): void {
  if (installedFilter) return;
  installedFilter = true;
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
