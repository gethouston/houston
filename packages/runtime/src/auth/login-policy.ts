export const OPENAI_CODEX_BROWSER_LOGIN_METHOD = "browser";
export const OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD = "device_code";

export function codexLoginMethod(opts: { deviceAuth: boolean }): string {
  return opts.deviceAuth
    ? OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD
    : OPENAI_CODEX_BROWSER_LOGIN_METHOD;
}

export function autoPromptAnswer(
  provider: string,
  enterpriseDomain?: string,
): string | null {
  return provider === "github-copilot" ? (enterpriseDomain ?? "") : null;
}
