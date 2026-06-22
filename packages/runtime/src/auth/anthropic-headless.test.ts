import { test, expect, afterEach } from "bun:test";
import {
  getOAuthProvider,
  resetOAuthProviders,
  type OAuthLoginCallbacks,
} from "@earendil-works/pi-ai/oauth";
import {
  anthropicHeadlessOAuthProvider,
  buildAuthorizeUrl,
  generatePKCE,
  parseAuthCode,
  registerHeadlessAnthropicProvider,
} from "./anthropic-headless";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetOAuthProviders();
});

test("parseAuthCode handles code#state, full URL, and bare code", () => {
  expect(parseAuthCode("abc123#st-99")).toEqual({
    code: "abc123",
    state: "st-99",
  });
  expect(
    parseAuthCode(
      "https://console.anthropic.com/oauth/code/callback?code=abc&state=xyz",
    ),
  ).toEqual({ code: "abc", state: "xyz" });
  expect(parseAuthCode("just-a-code")).toEqual({ code: "just-a-code" });
  expect(parseAuthCode("   ")).toEqual({});
});

test("buildAuthorizeUrl targets the manual code-copy redirect (no loopback)", () => {
  const url = new URL(buildAuthorizeUrl("the-challenge", "the-state"));
  expect(url.origin + url.pathname).toBe("https://claude.ai/oauth/authorize");
  // The headless redirect — NOT localhost:53692 — is what makes Claude render a
  // copyable code instead of redirecting to a machine the engine can't reach.
  expect(url.searchParams.get("redirect_uri")).toBe(
    "https://console.anthropic.com/oauth/code/callback",
  );
  expect(url.searchParams.get("code")).toBe("true");
  expect(url.searchParams.get("code_challenge")).toBe("the-challenge");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe("the-state");
  expect(url.searchParams.get("scope")).toContain("user:inference");
});

test("generatePKCE produces a base64url verifier and its SHA-256 challenge", async () => {
  const { verifier, challenge } = await generatePKCE();
  expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  // Challenge must be base64url(SHA-256(verifier)).
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const expected = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  expect(challenge).toBe(expected);
});

test("registerHeadlessAnthropicProvider overrides the built-in anthropic provider", () => {
  expect(getOAuthProvider("anthropic")?.usesCallbackServer).toBe(true); // built-in loopback
  registerHeadlessAnthropicProvider();
  const provider = getOAuthProvider("anthropic");
  expect(provider?.id).toBe("anthropic");
  expect(provider?.usesCallbackServer).toBe(false); // headless: user pastes a code
  resetOAuthProviders();
  expect(getOAuthProvider("anthropic")?.usesCallbackServer).toBe(true); // restored
});

test("login exchanges the pasted code for tokens via the headless flow", async () => {
  let exchangeBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (
    _url: string | URL | Request,
    init?: RequestInit,
  ) => {
    exchangeBody = JSON.parse(init?.body as string) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        access_token: "access-tok",
        refresh_token: "refresh-tok",
        expires_in: 3600,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  let pastedState = "";
  const callbacks: OAuthLoginCallbacks = {
    onAuth: ({ url }) => {
      // Echo back the state the engine sent (Claude returns `code#state`).
      pastedState = new URL(url).searchParams.get("state") ?? "";
    },
    onDeviceCode: () => {},
    onPrompt: async () => "",
    onSelect: async () => undefined,
    onManualCodeInput: async () => `the-code#${pastedState}`,
  };

  const creds = await anthropicHeadlessOAuthProvider.login(callbacks);

  expect(creds.access).toBe("access-tok");
  expect(creds.refresh).toBe("refresh-tok");
  expect(creds.expires).toBeGreaterThan(Date.now());
  // Exchange must use the same headless redirect + the pasted code.
  expect(exchangeBody.grant_type).toBe("authorization_code");
  expect(exchangeBody.code).toBe("the-code");
  expect(exchangeBody.redirect_uri).toBe(
    "https://console.anthropic.com/oauth/code/callback",
  );
  expect(typeof exchangeBody.code_verifier).toBe("string");
});

test("login rejects a state mismatch (CSRF guard)", async () => {
  const callbacks: OAuthLoginCallbacks = {
    onAuth: () => {},
    onDeviceCode: () => {},
    onPrompt: async () => "",
    onSelect: async () => undefined,
    onManualCodeInput: async () => "the-code#not-the-real-state",
  };
  await expect(anthropicHeadlessOAuthProvider.login(callbacks)).rejects.toThrow(
    /state mismatch/i,
  );
});
