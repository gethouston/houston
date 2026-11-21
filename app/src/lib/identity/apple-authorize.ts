import { gatewayUrl } from "../auth-gateway";
import { appleReturnUrl } from "./apple-return.ts";
import { runBrokeredDeepLinkAuthorize } from "./brokered-authorize.ts";
import { identityConfig } from "./config.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";
import { createAuthUri } from "./firebase-rest.ts";

const APPLE_SCOPES = "name email";

export interface AppleAuthorizeResult {
  requestUri: string;
  sessionId: string;
}

export async function authorizeAppleDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<AppleAuthorizeResult | null> {
  const bridgeUrl = appleReturnUrl(gatewayUrl());
  let sessionId = "";
  const result = await runBrokeredDeepLinkAuthorize(async () => {
    const minted = await createAuthUri({
      apiKey: identityConfig.apiKey,
      providerId: "apple.com",
      continueUri: bridgeUrl,
      oauthScope: APPLE_SCOPES,
    });
    sessionId = minted.sessionId;
    const state = new URL(minted.authUri).searchParams.get("state");
    if (!state) {
      throw new IdentityError("malformed_response", {
        rawCode: "auth_uri_missing_state",
      });
    }
    return { url: minted.authUri, expectedState: state };
  }, opts);
  if (!result) return null;
  return {
    requestUri: `${bridgeUrl}?${result.callbackQuery}`,
    sessionId,
  };
}
