import { join } from "node:path";
import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { config } from "../config";
import { readAuthFile, readServedProvidersAt } from "./auth-file";
import { serveModeOn } from "./serve";

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
 * Deliberately narrow. Three gates, each of which would otherwise let a report
 * sign a workspace out of a credential that is fine:
 *
 *  1. `token_revoked` ONLY, never `unauthenticated` at large. The broad kind
 *     covers transient provider auth blips and misconfigured keys; the terminal
 *     cause is the one that means "this token is dead forever" (see
 *     protocol/provider-error.ts).
 *  2. Serve mode, and the provider must be in the SERVED manifest. A credential
 *     this runtime owns locally (a desktop keychain login) is none of the
 *     control plane's business, and reporting it would ask the store to delete
 *     a row that never backed this turn.
 *  3. OAuth only. An api_key has no revocation semantics worth acting on here,
 *     and treating one as revoked would delete a key the user still wants.
 *
 * Fire-and-forget and never throws: this runs inside error handling for a turn
 * that has already failed, and a reporting hiccup must not replace the real
 * provider error the user needs to see.
 */
export function reportRevokedServedToken(err: ProviderError): void {
  void reportRevoked(err).catch(() => {});
}

async function reportRevoked(err: ProviderError): Promise<void> {
  if (err.kind !== "unauthenticated" || err.cause !== "token_revoked") return;
  if (!serveModeOn()) return;

  const provider = err.provider;
  const served = readServedProvidersAt(
    join(config.dataDir, "served-providers.json"),
  );
  if (!served.includes(provider)) return;

  const cred = readAuthFile(join(config.dataDir, "auth.json"))[provider];
  if (cred?.type !== "oauth" || !cred.access) return;

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
          accessSha256: accessDigest(cred.access),
        }),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
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
    console.warn(
      `[serve] revoked-token report for ${provider} failed:`,
      reportErr instanceof Error ? reportErr.message : reportErr,
    );
  }
}

/** One stalled control-plane socket must not outlive the failed turn. */
const REPORT_TIMEOUT_MS = 10_000;
