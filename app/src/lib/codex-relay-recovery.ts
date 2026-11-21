import { isProviderLoginSessionLostError } from "./provider-login-session-lost.ts";

export const RELAY_RESTART_COOLDOWN_MS = 5 * 60_000;

export interface CodexRelayRecoveryOps {
  report(cause: unknown): void;
  breadcrumb(cause: unknown): void;
  restartLogin(): Promise<void>;
  fail(cause: unknown): void;
  expired(restarting: boolean): void;
  lastRestartAt(): number | null;
  noteRestart(): void;
  now(): number;
}

export async function recoverFailedCodexRelay(
  cause: unknown,
  ops: CodexRelayRecoveryOps,
): Promise<void> {
  if (!isProviderLoginSessionLostError(cause)) {
    ops.report(cause);
    ops.fail(cause);
    return;
  }
  ops.breadcrumb(cause);
  const last = ops.lastRestartAt();
  const canRestart =
    last === null || ops.now() - last >= RELAY_RESTART_COOLDOWN_MS;
  if (!canRestart) {
    ops.expired(false);
    return;
  }
  ops.noteRestart();
  ops.expired(true);
  try {
    await ops.restartLogin();
  } catch (err) {
    ops.fail(err);
  }
}
