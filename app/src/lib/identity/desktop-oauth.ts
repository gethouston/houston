import {
  type OauthLoopbackStart,
  osCancelOauthLoopback,
  osOpenUrl,
  osStartOauthLoopback,
} from "../os-bridge";
import { listenDeepLink } from "./deep-link-listen.ts";
import { IdentityError, isIdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import {
  awaitLoopbackCallback,
  cancelPendingAuthorize,
} from "./oauth-attempt.ts";
import { withBrowserOpenDeadline } from "./oauth-attempt-contract.ts";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./pkce.ts";

export { cancelPendingAuthorize };

export interface LoopbackAuthorizeParams {
  authorizeBase: string;
  clientId: string;
  scope: string;
  extraParams?: Record<string, string>;
}

export interface LoopbackAuthorizeOptions {
  onBrowserOpened?: () => void;
}

export interface LoopbackAuthorizeResult {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

const LOG_CTX = "identity/desktop-oauth";

function releaseLoopback(attemptId: number, why: string): void {
  void osCancelOauthLoopback(attemptId).catch((e) =>
    identityLog(
      "warn",
      `failed to free loopback port (${why}): ${String(e)}`,
      LOG_CTX,
    ),
  );
}

export async function runLoopbackAuthorize(
  params: LoopbackAuthorizeParams,
  opts?: LoopbackAuthorizeOptions,
): Promise<LoopbackAuthorizeResult | null> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);
  const state = generateState();

  let started: OauthLoopbackStart;
  try {
    started = await withBrowserOpenDeadline(
      osStartOauthLoopback(state),
      "loopback_bind",
      {
        releaseIfLate: (late) => {
          if (late.status === "listening") {
            releaseLoopback(
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
      "loopback authorize superseded by a newer click before binding",
      LOG_CTX,
    );
    return null;
  }
  if (started.status === "portBusy") {
    throw new IdentityError("unknown", { rawCode: "loopback_bind_failed" });
  }
  const { redirectUri, attemptId } = started;

  const url = new URL(params.authorizeBase);
  const q = url.searchParams;
  q.set("client_id", params.clientId);
  q.set("redirect_uri", redirectUri);
  q.set("response_type", "code");
  q.set("scope", params.scope);
  q.set("code_challenge", codeChallenge);
  q.set("code_challenge_method", "S256");
  q.set("state", state);
  for (const [k, v] of Object.entries(params.extraParams ?? {})) q.set(k, v);

  const code = await awaitLoopbackCallback({
    expectedState: state,
    authorizeUrl: url.toString(),
    listen: listenDeepLink,
    openUrl: osOpenUrl,
    onBrowserOpened: opts?.onBrowserOpened,
    abandonLoopback: () => releaseLoopback(attemptId, "attempt abandoned"),
  });
  if (code === null) return null;
  return { code, redirectUri, codeVerifier };
}

export { postTokenForm } from "./token-exchange.ts";
