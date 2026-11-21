import { osOpenUrl } from "../os-bridge";
import { listenDeepLink } from "./deep-link-listen.ts";
import type { LoopbackAuthorizeOptions } from "./desktop-oauth.ts";
import { awaitLoopbackCallback } from "./oauth-attempt.ts";
import { parseCallbackQuery } from "./oauth-callback.ts";

export interface BrokeredAuthorizeResult {
  callbackQuery: string;
}

export async function runBrokeredDeepLinkAuthorize(
  mintAuthorizeUrl: () => Promise<{ url: string; expectedState: string }>,
  opts?: LoopbackAuthorizeOptions,
): Promise<BrokeredAuthorizeResult | null> {
  const minted = await mintAuthorizeUrl();
  const callbackQuery = await awaitLoopbackCallback({
    expectedState: minted.expectedState,
    authorizeUrl: minted.url,
    listen: listenDeepLink,
    openUrl: osOpenUrl,
    onBrowserOpened: opts?.onBrowserOpened,
    parsePayload: parseCallbackQuery,
  });
  if (callbackQuery === null) return null;
  return { callbackQuery };
}
