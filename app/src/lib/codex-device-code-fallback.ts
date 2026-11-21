export interface CodexDeviceCodeFallbackOps {
  report(cause: unknown): void;
  reportPortTaken(cause: unknown): void;
  cancelLogin(): Promise<void>;
  launchDeviceCodeLogin(): Promise<void>;
  fail(cause: unknown): void;
}

const PORT_TAKEN_PREFIX = "Could not start the Codex sign-in listener:";

export function isCodexPortTaken(cause: unknown): boolean {
  const message =
    typeof cause === "string"
      ? cause
      : cause instanceof Error
        ? cause.message
        : "";
  return message.startsWith(PORT_TAKEN_PREFIX);
}

export async function runCodexDeviceCodeFallback(
  cause: unknown,
  ops: CodexDeviceCodeFallbackOps,
): Promise<void> {
  if (isCodexPortTaken(cause)) ops.reportPortTaken(cause);
  else ops.report(cause);
  try {
    await ops.cancelLogin();
    await ops.launchDeviceCodeLogin();
  } catch (err) {
    ops.fail(err);
  }
}
