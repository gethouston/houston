import type { AuthFailureCause, ProviderError } from "@houston/protocol";
import { revocationConfirmed } from "./revocation-markers";
import {
  currentTurnCredentialChannel,
  type TurnCredentialChannel,
} from "./turn-credential-channel";
import {
  removeTurnCredentialIfAccess,
  reportTurnCredentialHealth,
  trackTurnCredentialReport,
} from "./turn-credential-report";

const reported = new Set<string>();

const CREDENTIAL_IS_BAD: ReadonlySet<AuthFailureCause> = new Set([
  "token_revoked",
  "invalid_api_key",
]);

export function reportTurnAuthFailure(
  err: ProviderError,
  usedAccessDigest: string | undefined,
): boolean {
  const channel = currentTurnCredentialChannel();
  if (!channel) return false;
  if (err.kind === "unauthenticated" && CREDENTIAL_IS_BAD.has(err.cause))
    reportTurnCredentialHealth("needs_reconnect", err.provider, {
      usedAccessDigest,
    });
  trackTurnCredentialReport(
    channel,
    reportRevokedForTurn(channel, err, usedAccessDigest),
  );
  return true;
}

export function resetTurnRevokedReportsForTest(): void {
  reported.clear();
}

async function reportRevokedForTurn(
  channel: TurnCredentialChannel,
  err: ProviderError,
  usedAccessDigest: string | undefined,
): Promise<void> {
  if (err.kind !== "unauthenticated" || err.cause !== "token_revoked") return;
  if (!revocationConfirmed(err.message)) return;
  const provider = err.provider;
  if (provider !== channel.provider || channel.kind !== "oauth") return;
  if (!usedAccessDigest) {
    console.log(
      `[serve] skipped the revoked-token report for ${provider}: the failed turn's token is unknown`,
    );
    return;
  }
  const dedupe = `turn:${channel.orgSlug}:${channel.agentSlug}:${channel.scope}:${provider}:${usedAccessDigest}`;
  if (reported.has(dedupe)) {
    console.log(
      `[serve] suppressed a duplicate revoked-token report for ${provider} (already reported this token)`,
    );
    return;
  }
  reported.add(dedupe);
  try {
    const removed = await removeTurnCredentialIfAccess(
      channel,
      usedAccessDigest,
    );
    console.log(
      `[serve] reported revoked ${provider} token: ${
        removed
          ? "central credential disconnected"
          : "superseded, left in place"
      }`,
    );
  } catch (reportErr) {
    reported.delete(dedupe);
    console.warn(
      `[serve] revoked-token report for ${provider} failed:`,
      reportErr instanceof Error ? reportErr.message : reportErr,
    );
  }
}
