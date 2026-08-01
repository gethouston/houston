import { accessDigest } from "@houston/protocol/access-digest";
import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import type { ServedCredential } from "./auth-file";

/**
 * Guard against a served "API key" that can never authenticate (HOU-1107,
 * Sentry HOUSTON-APP-4Y9: 404 failed Gemini turns across 110 users, all
 * managed-cloud).
 *
 * Before the paste-a-key live verification existed, any pasted string was
 * stored as a connected google credential; users pasted OAuth access tokens
 * (`ya29.…`, JWTs) instead of Gemini API keys, and those were captured into
 * the central store as `api_key` rows. The store treats api_key rows as
 * never-expiring and has no google refresher, so it serves the dead token to
 * every pod forever; pi sends it as `x-goog-api-key` and Google answers
 * 401 UNAUTHENTICATED (`ACCESS_TOKEN_TYPE_UNSUPPORTED`) on every turn — with
 * the serve sync re-applying the credential before the next one.
 *
 * Refusing the credential here (serve.ts) turns the burning 401 into the
 * honest state — google reads not-connected, the UI shows the connect card —
 * and the report below deletes the central row so the whole workspace heals,
 * not just this pod. New pastes cannot recreate these rows: verify-api-key.ts
 * live-verifies a google key against the models-list endpoint.
 */

/**
 * True when the served credential is a google "api_key" whose value cannot be
 * a Gemini API key. Every Google Cloud API key starts with `AIza` (a
 * documented, stable prefix); the legacy garbage never does — it is OAuth
 * material (`ya29.…` user tokens, `eyJ…` JWTs). Scoped to google only: no
 * other provider has this legacy family, and other providers' key shapes are
 * not this crisp.
 */
export function servedApiKeyIsDead(cred: ServedCredential): boolean {
  return (
    cred.provider === "google" &&
    cred.kind === "api_key" &&
    !cred.access.startsWith("AIza")
  );
}

/** One report per (scope, provider, token) per pod lifetime — the serve sync
 *  runs on every turn and hydrating route, and the store's delete is already
 *  idempotent, so repeats are pure noise. */
const reported = new Set<string>();

/**
 * Tell the control plane the served key is dead so it stops serving it —
 * the same digest-named compare-and-delete the revoked-token path uses
 * (HOU-952: routes/credential-revoked.ts → store removeIfAccess). The token
 * is named by digest, never shipped; a report racing a user's reconnect
 * cannot delete the fresh credential.
 *
 * Fire-and-forget and never throws: this runs inside the serve sync, and a
 * reporting hiccup must not fail the hydration it rides on.
 */
export function reportDeadServedApiKey(cred: ServedCredential): void {
  void report(cred).catch(() => {});
}

async function report(cred: ServedCredential): Promise<void> {
  if (!config.controlPlaneUrl || !config.sandboxToken) return;
  const { key, actingAs } = currentCredentialScope();
  const digest = accessDigest(cred.access);
  const dedupe = `${key}:${cred.provider}:${digest}`;
  if (reported.has(dedupe)) return;
  reported.add(dedupe);
  console.error(
    `[serve] served ${cred.provider} credential is not an API key (an OAuth-type token that can never authenticate) — refusing it and reporting the dead central row`,
  );
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
      // Let a later sync retry against a control plane that answers.
      reported.delete(dedupe);
      console.warn(
        `[serve] dead-key report for ${cred.provider} failed: ${res.status}`,
      );
    }
  } catch (err) {
    reported.delete(dedupe);
    console.warn(
      `[serve] dead-key report for ${cred.provider} failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** One stalled control-plane socket must not outlive the sync it rides on. */
const REPORT_TIMEOUT_MS = 10_000;

/** Test-only: clear the per-pod report dedupe. */
export function resetDeadKeyReportsForTest(): void {
  reported.clear();
}
