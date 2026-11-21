export interface ClaudeLoginDone {
  success: boolean;
  error: string | null;
  helperUnavailable?: boolean;
  shellUnavailable?: boolean;
  networkUnavailable?: boolean;
}

export type ClaudeLoginFailureRoute =
  | { kind: "silent" }
  | { kind: "paste-fallback"; reason: string }
  | { kind: "helper-unsupported" }
  | { kind: "shell-unavailable" }
  | { kind: "offline"; error: string }
  | { kind: "error"; error: string };

export function classifyClaudeLoginFailure(
  done: ClaudeLoginDone,
  remoteEngine: boolean,
): ClaudeLoginFailureRoute {
  if (done.helperUnavailable) {
    return remoteEngine
      ? { kind: "paste-fallback", reason: done.error ?? "helper unavailable" }
      : { kind: "helper-unsupported" };
  }
  if (done.shellUnavailable) {
    return remoteEngine
      ? { kind: "paste-fallback", reason: done.error ?? "shell unavailable" }
      : { kind: "shell-unavailable" };
  }
  if (done.networkUnavailable) {
    return { kind: "offline", error: done.error ?? "network unavailable" };
  }
  if (done.error === null) return { kind: "silent" };
  return { kind: "error", error: done.error };
}
