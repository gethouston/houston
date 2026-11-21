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

const CANDIDATE_PORTS = [8975, 8976, 8977, 8978];

export interface BrokeredLoopbackDeps {
  mint: (
    continueUri: string,
  ) => Promise<{ authUri: string; sessionId: string }>;
  startLoopback: (
    expectedState: string,
    exactPort: number,
  ) => Promise<OauthLoopbackStart>;
  releaseLoopback: (attemptId: number, why: string) => void;
  listen: DeepLinkListen;
  openUrl: (url: string) => Promise<unknown>;
}

export interface BrokeredLoopbackResult {
  requestUri: string;
  sessionId: string;
}

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
    if (query === null) return null;
    return {
      requestUri: `${continueUri}?${query}`,
      sessionId: minted.sessionId,
    };
  }
  throw new IdentityError("unknown", { rawCode: "loopback_ports_exhausted" });
}
