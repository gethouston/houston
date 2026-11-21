import {
  osCancelOauthLoopback,
  osOpenUrl,
  osStartOauthLoopback,
} from "../os-bridge";
import {
  type BrokeredLoopbackResult,
  runBrokeredLoopbackAuthorize,
} from "./brokered-loopback.ts";
import { identityConfig } from "./config.ts";
import { listenDeepLink } from "./deep-link-listen.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { createAuthUri } from "./firebase-rest.ts";
import { identityLog } from "./log.ts";

const LOG_CTX = "identity/microsoft-authorize";

export function authorizeMicrosoftDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<BrokeredLoopbackResult | null> {
  return runBrokeredLoopbackAuthorize(
    {
      mint: (continueUri) =>
        createAuthUri({
          apiKey: identityConfig.apiKey,
          providerId: "microsoft.com",
          continueUri,
        }),
      startLoopback: osStartOauthLoopback,
      releaseLoopback: (attemptId, why) => {
        void osCancelOauthLoopback(attemptId).catch((e) =>
          identityLog(
            "warn",
            `failed to free loopback port (${why}): ${String(e)}`,
            LOG_CTX,
          ),
        );
      },
      listen: listenDeepLink,
      openUrl: osOpenUrl,
    },
    opts,
  );
}
