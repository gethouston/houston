import type { ServerResponse } from "node:http";
import type { CustomIntegrationManager } from "../integrations/custom/manager";

/**
 * The PUBLIC OAuth callback for custom integrations (PRODUCT-1172):
 * `GET /v1/integrations/custom/oauth/callback?code&state`. The user's browser
 * lands here after the service's consent screen — there is no Houston bearer
 * token on that request, so the route mounts BEFORE `principal(...)` and the
 * single-use, expiring `state` minted by the start route is its whole
 * authentication. The response is a tiny self-contained page telling the user
 * to return to Houston; the app itself learns the outcome through the
 * `CustomIntegrationsChanged` event the completion emits.
 */
export const CUSTOM_OAUTH_CALLBACK_PATH =
  "/v1/integrations/custom/oauth/callback";

const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function page(res: ServerResponse, ok: boolean, detail?: string): void {
  const title = ok ? "Connected" : "Sign-in didn't finish";
  const body = ok
    ? "You're all set. You can close this tab and return to Houston."
    : `${detail ? `${esc(detail)}. ` : ""}Close this tab and try signing in again from Houston.`;
  res.writeHead(ok ? 200 : 400, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title} - Houston</title>` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<style>body{font-family:ui-sans-serif,-apple-system,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#fcfcfc;color:#1a1a1a}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.25rem;font-weight:500}p{color:#555;line-height:1.5}</style>` +
      `</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
  );
}

export async function handleCustomOAuthCallback(
  deps: { customIntegrations?: CustomIntegrationManager },
  method: string,
  path: string,
  url: URL,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET" || path !== CUSTOM_OAUTH_CALLBACK_PATH) return false;
  const manager = deps.customIntegrations;
  if (!manager) {
    page(res, false, "custom integrations are not available on this install");
    return true;
  }
  const errorParam = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (errorParam || !code || !state) {
    // A denied consent screen or a malformed redirect: nothing was granted.
    page(
      res,
      false,
      url.searchParams.get("error_description") ??
        (errorParam === "access_denied"
          ? "The sign-in was declined"
          : undefined),
    );
    return true;
  }
  try {
    await manager.completeOAuth(state, code);
    page(res, true);
  } catch (err) {
    page(res, false, err instanceof Error ? err.message : undefined);
  }
  return true;
}
