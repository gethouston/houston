export type ClaudeHandoffResult =
  | { ok: true }
  | { ok: false; reason: "no-credential" | "push-failed"; error: unknown };

export type ClaudeLoginSettlement =
  | { kind: "connected"; recovered: boolean }
  | { kind: "confirm-timeout" }
  | { kind: "handoff-failed"; reason: unknown };

export async function settleRemoteClaudeLogin(
  result: ClaudeHandoffResult,
  confirm: () => Promise<boolean>,
): Promise<ClaudeLoginSettlement> {
  if (result.ok) {
    return (await confirm())
      ? { kind: "connected", recovered: false }
      : { kind: "confirm-timeout" };
  }
  if (result.reason === "push-failed" && (await confirm())) {
    return { kind: "connected", recovered: true };
  }
  return { kind: "handoff-failed", reason: result.error };
}
