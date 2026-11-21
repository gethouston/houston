import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import {
  authPathIn,
  readAuthFile,
  readServedProvidersAt,
  servedProvidersPathIn,
} from "./auth-file";
import { revocationConfirmed } from "./revocation-markers";
import { servedScopeFor } from "./served-scope";

export function reportRevokedServedToken(
  err: ProviderError,
  usedAccessDigest: string | undefined,
): void {
  void reportRevoked(err, usedAccessDigest).catch(() => {});
}

const reported = new Set<string>();

export function resetRevokedReportsForTest(): void {
  reported.clear();
}

async function reportRevoked(
  err: ProviderError,
  usedAccessDigest: string | undefined,
): Promise<void> {
  if (err.kind !== "unauthenticated" || err.cause !== "token_revoked") return;
  if (!revocationConfirmed(err.message)) return;
  if (!config.controlPlaneUrl || !config.sandboxToken) return;

  const provider = err.provider;
  const { key, actingAs } = currentCredentialScope();
  const served = readServedProvidersAt(
    servedProvidersPathIn(config.dataDir, key),
  );
  if (!served.includes(provider)) return;

  if (!usedAccessDigest) {
    console.log(
      `[serve] skipped the revoked-token report for ${provider}: the failed turn's token is unknown`,
    );
    return;
  }
  const digest = usedAccessDigest;
  const stored = readAuthFile(authPathIn(config.dataDir, key))[provider];
  if (
    stored?.type === "oauth" &&
    stored.access &&
    accessDigest(stored.access) !== digest
  ) {
    console.log(
      `[serve] stored ${provider} token differs from the one the failed turn ran on; reporting the failed token's digest`,
    );
  }
  const scope = servedScopeFor(provider) ?? "team";
  const dedupe = `${key}:${provider}:${digest}`;
  if (reported.has(dedupe)) {
    console.log(
      `[serve] suppressed a duplicate revoked-token report for ${provider} (already reported this token)`,
    );
    return;
  }
  reported.add(dedupe);

  try {
    const res = await fetch(
      `${config.controlPlaneUrl}/sandbox/credential/revoked`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.sandboxToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider,
          accessSha256: digest,
          scope,
          ...(actingAs ? { actingAs } : {}),
        }),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      reported.delete(dedupe);
      console.warn(
        `[serve] revoked-token report for ${provider} failed: ${res.status}`,
      );
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      removed?: boolean;
    } | null;
    console.log(
      `[serve] reported revoked ${provider} token: ${
        body?.removed
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

const REPORT_TIMEOUT_MS = 10_000;
