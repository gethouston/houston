import {
  refreshAnthropicToken,
  registerOAuthProvider,
  type OAuthCredentials,
  type OAuthLoginCallbacks,
  type OAuthProviderInterface,
} from "@earendil-works/pi-ai/oauth";

/**
 * Headless Anthropic (Claude Pro/Max) OAuth.
 *
 * pi-ai's built-in `anthropic` provider catches the redirect on a local loopback
 * server, which only works when the browser and the engine share a machine.
 * Anthropic has no device-code grant, so the headless path is the one Claude Code
 * uses for browserless login: authorization-code + PKCE with the manual code-copy
 * redirect (`console.anthropic.com/oauth/code/callback`) plus `code=true`, which
 * makes Claude render a copyable `code#state`. The user pastes it back (via
 * `completeLogin`) and we exchange it for tokens — no loopback.
 *
 * Registered over the built-in (see main.ts); login, refresh, and persistence
 * still route through `AuthStorage`, and refresh reuses pi-ai's
 * `refreshAnthropicToken`, so the token lifecycle matches the local flow.
 */

// Public Claude Code OAuth client id (not a secret — it travels in the authorize
// URL). Mirrors pi-ai's built-in provider so the issued token is identical.
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

/** Base64url without padding (PKCE + challenge encoding). */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** PKCE pair via Web Crypto (same algorithm as pi-ai's pkce.ts). */
export async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64url(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Accept the `code#state` Claude shows, a full redirect URL, or a bare code. */
export function parseAuthCode(input: string): {
  code?: string;
  state?: string;
} {
  const value = input.trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    // not a URL
  }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2);
    return { code, state };
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value);
    return {
      code: params.get("code") ?? undefined,
      state: params.get("state") ?? undefined,
    };
  }
  return { code: value };
}

async function exchangeCode(
  code: string,
  state: string,
  verifier: string,
): Promise<OAuthCredentials> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Claude token exchange failed (HTTP ${res.status}): ${text}`,
    );
  }
  const data = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    refresh: data.refresh_token,
    access: data.access_token,
    // Refresh 5 min early, matching pi-ai.
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

async function headlessLogin(
  callbacks: OAuthLoginCallbacks,
): Promise<OAuthCredentials> {
  // state === verifier mirrors pi-ai; Claude echoes it back in `code#state`.
  const { verifier, challenge } = await generatePKCE();
  callbacks.onAuth({
    url: buildAuthorizeUrl(challenge, verifier),
    instructions:
      "Approve in your browser, then copy the code Claude shows and paste it here.",
  });

  const input = callbacks.onManualCodeInput
    ? await callbacks.onManualCodeInput()
    : await callbacks.onPrompt({
        message: "Paste the code Claude gave you",
        placeholder: "code#state",
      });

  const { code, state } = parseAuthCode(input);
  if (!code) throw new Error("No authorization code provided");
  if (state && state !== verifier) throw new Error("OAuth state mismatch");

  callbacks.onProgress?.("Exchanging authorization code for tokens...");
  return exchangeCode(code, state ?? verifier, verifier);
}

export const anthropicHeadlessOAuthProvider: OAuthProviderInterface = {
  id: "anthropic",
  name: "Anthropic (Claude Pro/Max)",
  // No loopback server — the user pastes a code, so the engine emits `auth_code`.
  usesCallbackServer: false,
  login: headlessLogin,
  refreshToken: (credentials) =>
    refreshAnthropicToken(credentials.refresh as string),
  getApiKey: (credentials) => credentials.access as string,
};

/** Replace pi-ai's built-in `anthropic` provider with the headless flow. */
export function registerHeadlessAnthropicProvider(): void {
  registerOAuthProvider(anthropicHeadlessOAuthProvider);
}
