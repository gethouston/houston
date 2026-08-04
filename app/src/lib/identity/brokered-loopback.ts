// The GCIP-BROKERED authorize round-trip over the desktop loopback (Microsoft).
//
// Unlike desktop-oauth.ts (loopback+PKCE, where THIS client redeems the code at
// the provider's token endpoint), the authorize URL here is minted by GCIP
// (`createAuthUri`): GCIP owns the OAuth `state` and redeems the callback
// itself, server-side, with the provider secret held in the identity project's
// provider config (`signInWithIdpSession`). The client never touches the
// provider's token endpoint — which is the point: Entra refuses public-client
// redemptions coming from a webview (AADSTS90023, the fetch's `Origin` header
// marks them cross-origin) and GCIP refuses externally obtained Microsoft
// tokens outright (`INVALID_CREDENTIAL_OR_PROVIDER_ID`), so a direct PKCE
// exchange can never complete for `microsoft.com` (HOU-1112).
//
// The chicken-and-egg this module owns: GCIP's `state` exists only AFTER
// minting, but minting needs the `continueUri` — port included. So each
// candidate port is minted for FIRST and then bound EXACTLY (`exactPort`);
// a foreign squatter answers `portBusy` and we re-mint for the next candidate.
// The `continueUri` must be spelled `http://localhost:<port>` (not 127.0.0.1):
// it must match the Azure app's **Web**-platform redirect URIs, and Entra only
// allows plain http there for `localhost`. The native listener binds both
// loopback stacks, so the browser may resolve `localhost` to either.
//
// Pure driver: every effect (mint, bind, listen, open) is injected, so the
// port-stepping and cancel semantics are unit-testable (no Tauri imports).

import type { OauthLoopbackStart } from "../os-bridge";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { IdentityError, isIdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import { awaitLoopbackCallback } from "./oauth-attempt.ts";
import {
  type DeepLinkListen,
  withBrowserOpenDeadline,
} from "./oauth-attempt-contract.ts";
import { parseCallbackQuery } from "./oauth-callback.ts";

const LOG_CTX = "identity/brokered-loopback";

/** Loopback ports to try, in order — mirrors the native candidate list, and
 *  every one must be registered on the Azure app's Web platform as
 *  `http://localhost:<port>/auth/callback`. */
const CANDIDATE_PORTS = [8975, 8976, 8977, 8978];

/** The effects one brokered-loopback authorize needs, injected for testability. */
export interface BrokeredLoopbackDeps {
  /** Mint the provider authorize URL for `continueUri` (GCIP `createAuthUri`). */
  mint: (
    continueUri: string,
  ) => Promise<{ authUri: string; sessionId: string }>;
  /** Bind the native listener on EXACTLY `port` (`osStartOauthLoopback`). */
  startLoopback: (
    expectedState: string,
    exactPort: number,
  ) => Promise<OauthLoopbackStart>;
  /** Free a bound listener by attempt id (`osCancelOauthLoopback`, logged). */
  releaseLoopback: (attemptId: number, why: string) => void;
  /** Subscribe to the `auth://deep-link` callback payload. */
  listen: DeepLinkListen;
  /** Open the authorize URL in the system browser. */
  openUrl: (url: string) => Promise<void>;
}

/** What `signInWithIdpSession` needs to redeem the round-trip. */
export interface BrokeredLoopbackResult {
  /** The full callback URL: continueUri + `?` + every param the provider sent. */
  requestUri: string;
  /** The `createAuthUri` session that pairs with the callback. */
  sessionId: string;
}

/** GCIP's own CSRF `state` rides the minted URL; without it the callback could
 *  never be validated, so refuse to open a browser we couldn't match. */
function extractState(authUri: string): string {
  let state: string | null;
  try {
    state = new URL(authUri).searchParams.get("state");
  } catch (e) {
    throw new IdentityError("malformed_response", {
      rawCode: "auth_uri_unparseable",
      cause: e,
    });
  }
  if (!state) {
    throw new IdentityError("malformed_response", {
      rawCode: "auth_uri_missing_state",
    });
  }
  return state;
}

/**
 * Run one GCIP-brokered authorize over the loopback. Resolves the redemption
 * pair, or `null` when the attempt was benignly cancelled (superseded /
 * unmount / timeout). Steps to the next candidate port (re-minting) when a
 * foreign process squats the current one.
 */
export async function runBrokeredLoopbackAuthorize(
  deps: BrokeredLoopbackDeps,
  opts?: LoopbackAuthorizeOptions,
): Promise<BrokeredLoopbackResult | null> {
  for (const port of CANDIDATE_PORTS) {
    const continueUri = `http://localhost:${port}/auth/callback`;
    const minted = await deps.mint(continueUri);
    const expectedState = extractState(minted.authUri);

    let started: OauthLoopbackStart;
    try {
      started = await withBrowserOpenDeadline(
        deps.startLoopback(expectedState, port),
        "loopback_bind",
        {
          // The invoke cannot be cancelled mid-flight; if the deadline wins we
          // free the listener the moment it finally appears (see desktop-oauth).
          releaseIfLate: (late) => {
            if (late.status === "listening") {
              deps.releaseLoopback(
                late.attemptId,
                "orphaned by the pre-browser deadline",
              );
            }
          },
        },
      );
    } catch (e) {
      if (isIdentityError(e)) throw e;
      throw new IdentityError("unknown", {
        rawCode: "loopback_bind_failed",
        cause: e,
      });
    }
    if (started.status === "superseded") {
      identityLog(
        "info",
        "brokered authorize superseded by a newer click before binding",
        LOG_CTX,
      );
      return null;
    }
    if (started.status === "portBusy") {
      // The minted authorize URL is tied to THIS port, so it is dropped along
      // with its GCIP session; the next iteration mints a fresh one.
      identityLog(
        "warn",
        `loopback port ${port} is busy; re-minting for the next candidate`,
        LOG_CTX,
      );
      continue;
    }
    const { attemptId } = started;

    const query = await awaitLoopbackCallback({
      expectedState,
      authorizeUrl: minted.authUri,
      listen: deps.listen,
      openUrl: deps.openUrl,
      onBrowserOpened: opts?.onBrowserOpened,
      parsePayload: parseCallbackQuery,
      abandonLoopback: () =>
        deps.releaseLoopback(attemptId, "attempt abandoned"),
    });
    if (query === null) return null; // benign cancel — no error, no session
    return {
      requestUri: `${continueUri}?${query}`,
      sessionId: minted.sessionId,
    };
  }
  throw new IdentityError("unknown", { rawCode: "loopback_ports_exhausted" });
}
