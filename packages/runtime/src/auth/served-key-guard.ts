import { accessDigest } from "@houston/protocol/access-digest";
import { deadGoogleApiKey } from "@houston/protocol/google-key";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import type { ServedCredential } from "./auth-file";
import {
  currentTurnCredentialChannel,
  type TurnCredentialChannel,
} from "./turn-credential-channel";
import {
  removeTurnCredentialIfAccess,
  trackTurnCredentialReport,
} from "./turn-credential-report";

export function servedApiKeyIsDead(cred: ServedCredential): boolean {
  return deadGoogleApiKey(cred);
}

const delivered = new Set<string>();
const pending = new Set<string>();
const announced = new Set<string>();

export function reportDeadServedApiKey(cred: ServedCredential): void {
  const channel = currentTurnCredentialChannel();
  if (channel) {
    trackTurnCredentialReport(channel, reportForTurn(channel, cred));
    return;
  }
  void report(cred).catch(() => {});
}

async function reportForTurn(
  channel: TurnCredentialChannel,
  cred: ServedCredential,
): Promise<void> {
  if (cred.provider !== channel.provider || !servedApiKeyIsDead(cred)) return;
  const digest = accessDigest(cred.access);
  const dedupe = `turn:${channel.orgSlug}:${channel.agentSlug}:${channel.scope}:${cred.provider}:${digest}`;
  if (delivered.has(dedupe) || pending.has(dedupe)) return;
  pending.add(dedupe);
  if (announced.has(dedupe)) {
    console.warn(
      `[serve] still refusing the dead ${cred.provider} credential — retrying the dead-row report`,
    );
  } else {
    announced.add(dedupe);
    console.error(
      `[serve] served ${cred.provider} credential is not an API key (an OAuth-type token that can never authenticate) — reporting the dead central row`,
    );
  }
  try {
    await removeTurnCredentialIfAccess(channel, digest);
    delivered.add(dedupe);
  } catch (err) {
    console.warn(
      `[serve] dead-key report for ${cred.provider} failed:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    pending.delete(dedupe);
  }
}

async function report(cred: ServedCredential): Promise<void> {
  if (!config.controlPlaneUrl || !config.sandboxToken) return;
  const { key, actingAs } = currentCredentialScope();
  const digest = accessDigest(cred.access);
  const dedupe = `${key}:${cred.provider}:${digest}`;
  if (delivered.has(dedupe) || pending.has(dedupe)) return;
  pending.add(dedupe);
  if (announced.has(dedupe)) {
    console.warn(
      `[serve] still refusing the dead ${cred.provider} credential — retrying the dead-row report`,
    );
  } else {
    announced.add(dedupe);
    console.error(
      `[serve] served ${cred.provider} credential is not an API key (an OAuth-type token that can never authenticate) — refusing it and reporting the dead central row`,
    );
  }
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
          provider: cred.provider,
          accessSha256: digest,
          scope: cred.scope === "personal" ? "personal" : "team",
          ...(actingAs ? { actingAs } : {}),
        }),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      console.warn(
        `[serve] dead-key report for ${cred.provider} failed: ${res.status}`,
      );
      return;
    }
    delivered.add(dedupe);
  } catch (err) {
    console.warn(
      `[serve] dead-key report for ${cred.provider} failed:`,
      err instanceof Error ? err.message : err,
    );
  } finally {
    pending.delete(dedupe);
  }
}

const REPORT_TIMEOUT_MS = 10_000;

export function resetDeadKeyReportsForTest(): void {
  delivered.clear();
  pending.clear();
  announced.clear();
}
