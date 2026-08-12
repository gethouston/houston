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

/**
 * Tell the control plane when a provider REVOKES a token it served us.
 *
 * A revoked token is not an expired one, and nothing upstream can tell them
 * apart: the credential is present and unexpired, so the control plane keeps
 * serving it to every runtime in the workspace and every turn 401s until the
 * clock runs out. Sentry HOUSTON-APP-4YA — 3,935 failed turns across 58 users.
 * The turn that just failed is the ONLY witness, so it has to speak up
 * (HOU-952).
 *
 * The pod-local mark in credential-health.ts stays: it makes THIS runtime stop
 * claiming "Connected". This is the other half — the workspace's other runtimes
 * cannot learn it from our memory.
 *
 * Deliberately narrow. Four gates, each of which would otherwise let a report
 * sign a workspace out of a credential that is fine:
 *
 *  1. `token_revoked` ONLY, never `unauthenticated` at large. The broad kind
 *     covers transient provider auth blips and misconfigured keys; the terminal
 *     cause is the one that means "this token is dead forever" (see
 *     protocol/provider-error.ts).
 *  2. The provider's own words must CONFIRM the revocation, not merely read
 *     like one (`revocation-markers.ts`).
 *  3. Serve mode, and the provider must be in the SERVED manifest. A credential
 *     this runtime owns locally (a desktop keychain login) is none of the
 *     control plane's business, and reporting it would ask the store to delete
 *     a row that never backed this turn.
 *  4. OAuth only. An api_key has no revocation semantics worth acting on here,
 *     and treating one as revoked would delete a key the user still wants.
 *     Enforced at CAPTURE: every `usedAccessDigest` source (the credential
 *     store's request-time read, the Claude spawn env, the per-turn hydrated
 *     read) digests OAuth access tokens only.
 *
 * `usedAccessDigest` is the digest of the token the FAILED turn actually ran
 * on, captured at request/spawn preparation (auth/used-token.ts, PRODUCT-1319).
 * The report names exactly that token — never whatever auth.json holds at
 * report time: a serve sync or user reconnect between the 401 and this report
 * swaps in a healthy replacement, and digesting the file then aimed the
 * gateway's compare-and-delete at the FRESH credential. Undefined means the
 * caller could not know the used token (the turn threw before any request
 * resolved a credential) — then the report is SKIPPED: deleting an unverified
 * target risks destroying a working credential workspace-wide, while a missed
 * report only costs the pre-HOU-952 status quo (a retry on the next failed
 * turn, or a manual reconnect).
 *
 * Fire-and-forget and never throws: this runs inside error handling for a turn
 * that has already failed, and a reporting hiccup must not replace the real
 * provider error the user needs to see.
 */
export function reportRevokedServedToken(
  err: ProviderError,
  usedAccessDigest: string | undefined,
): void {
  void reportRevoked(err, usedAccessDigest).catch(() => {});
}

/**
 * One report per (scope, provider, token) per pod lifetime — mirroring
 * served-key-guard.ts. The delete is idempotent, so repeats are pure noise;
 * worse, a control plane whose DELETE→GET path lags (HOUSTON-APP-530: bursts
 * of confirmed removals 15–30s apart from ONE pod) can re-serve the token this
 * pod already reported dead, and each re-serve burns a turn on a doomed 401
 * and re-fires the report. Reporting the same digest once stops this pod from
 * amplifying that; a failed report un-marks so a later turn retries.
 */
const reported = new Set<string>();

/** Test-only: clear the per-pod report dedupe. */
export function resetRevokedReportsForTest(): void {
  reported.clear();
}

async function reportRevoked(
  err: ProviderError,
  usedAccessDigest: string | undefined,
): Promise<void> {
  if (err.kind !== "unauthenticated" || err.cause !== "token_revoked") return;
  if (!revocationConfirmed(err.message)) return;
  // Serve mode, read straight off config rather than through serve.ts's
  // serveModeOn(). That import is what broke the engine bundle: serve.ts sits
  // in an async-initialized cycle (storage -> providers -> serve), so pulling
  // it in here made THIS module async too, and esbuild then emitted
  // `await init_report_revoked()` inside backends/claude/errors.ts's
  // non-async init wrapper -> `SyntaxError: Unexpected reserved word` at
  // runtime start. Same two reads, no cycle.
  if (!config.controlPlaneUrl || !config.sandboxToken) return;

  const provider = err.provider;
  // Everything below is read for the ACTING identity (HOU-976): a member reports
  // the token THEY were served, and the gateway must delete that row, not the
  // team's. Absent identity resolves to the one shared file, as before.
  const { key, actingAs } = currentCredentialScope();
  const served = readServedProvidersAt(
    servedProvidersPathIn(config.dataDir, key),
  );
  if (!served.includes(provider)) return;

  // The digest must name the token that PRODUCED the 401 (PRODUCT-1319) —
  // threaded in by the caller from the turn's capture, never re-read from
  // auth.json here: the file is mutable, and a re-serve or reconnect between
  // the 401 and this report replaces the dead token with a healthy one whose
  // deletion would sign the workspace out of a working credential. Unknown →
  // skip (see reportRevokedServedToken); falling back to the file would risk
  // exactly that deletion whenever a fresher token is already stored.
  if (!usedAccessDigest) {
    console.log(
      `[serve] skipped the revoked-token report for ${provider}: the failed turn's token is unknown`,
    );
    return;
  }
  const digest = usedAccessDigest;
  // Diagnostic only — the decision above never depends on the file. When the
  // stored token already rotated past the failed one, say so: the gateway's
  // compare-and-delete will no-op on the rotated row, which is the safety this
  // parameter exists to guarantee.
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
  // WHICH row the gateway served us. Unknown (a pre-HOU-976 gateway sends no
  // scope) reads as the team row — the only thing it could have been.
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
          // The token is named, never shipped: the control plane holds its own
          // copy and compares digests.
          accessSha256: digest,
          scope,
          // The scope alone says "a member's row", not WHOSE: the gateway keys
          // personal credentials by (org, user, provider) and answers 400
          // without an acting identity. Sent only when there is one, so a team
          // report stays the body a pre-HOU-976 control plane expects.
          ...(actingAs ? { actingAs } : {}),
        }),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      // Let a later turn retry against a control plane that answers.
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

/** One stalled control-plane socket must not outlive the failed turn. */
const REPORT_TIMEOUT_MS = 10_000;
