import { describe, expect, it } from "vitest";
import {
  beginCustomOAuth,
  CustomOAuthAttempts,
  settleCustomOAuth,
} from "./oauth-flow";
import type { CustomIntegrationDef } from "./types";

const ENDPOINT = "https://mcp.example.com/mcp";
const AS = "https://auth.example.com";

const DEF: CustomIntegrationDef & { kind: "mcp" } = {
  kind: "mcp",
  slug: "acme",
  name: "Acme",
  endpoint: ENDPOINT,
  auth: "oauth",
  addedAtMs: 1,
};

const METADATA = {
  issuer: AS,
  authorization_endpoint: `${AS}/authorize`,
  token_endpoint: `${AS}/token`,
  registration_endpoint: `${AS}/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A fake authorization server + resource server, request-recorded. */
function fakeAuthServer() {
  const calls: { url: string; body?: string }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : undefined;
    calls.push({ url, ...(body ? { body } : {}) });
    if (url.includes("oauth-protected-resource")) {
      return jsonRes({
        resource: "https://mcp.example.com",
        authorization_servers: [AS],
        scopes_supported: ["mcp.read", "mcp.write"],
      });
    }
    if (
      url.includes("oauth-authorization-server") ||
      url.includes("openid-configuration")
    ) {
      return jsonRes(METADATA);
    }
    if (url === `${AS}/register`) {
      const registered = JSON.parse(body ?? "{}") as Record<string, unknown>;
      return jsonRes({ ...registered, client_id: "houston-client" }, 201);
    }
    if (url === `${AS}/token`) {
      const params = new URLSearchParams(body ?? "");
      if (params.get("grant_type") === "authorization_code") {
        expect(params.get("code")).toBe("the-code");
        expect(params.get("code_verifier")).toBeTruthy();
        return jsonRes({
          access_token: "at-1",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "rt-1",
        });
      }
      return jsonRes({ error: "unsupported_grant_type" }, 400);
    }
    return jsonRes({ error: "not found" }, 404);
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("CustomOAuthAttempts", () => {
  const attempt = (slug: string) => ({
    slug,
    endpoint: ENDPOINT,
    codeVerifier: "v",
    redirectUri: "http://127.0.0.1:1/cb",
    authorizationServerUrl: AS,
    client: { client_id: "c", redirect_uris: ["http://127.0.0.1:1/cb"] },
    expiresAtMs: Date.now() + 60_000,
  });

  it("a state is single-use", () => {
    const attempts = new CustomOAuthAttempts();
    attempts.put("s1", attempt("acme"));
    expect(attempts.take("s1")).not.toBeNull();
    expect(attempts.take("s1")).toBeNull();
  });

  it("starting over invalidates the integration's previous attempt", () => {
    const attempts = new CustomOAuthAttempts();
    attempts.put("s1", attempt("acme"));
    attempts.put("s2", attempt("acme"));
    expect(attempts.take("s1")).toBeNull();
    expect(attempts.take("s2")).not.toBeNull();
  });

  it("an expired attempt is not honored", () => {
    const attempts = new CustomOAuthAttempts();
    attempts.put("s1", { ...attempt("acme"), expiresAtMs: Date.now() - 1 });
    expect(attempts.take("s1")).toBeNull();
  });
});

describe("beginCustomOAuth", () => {
  it("discovers, registers, and mints a PKCE authorize URL", async () => {
    const { fetchFn } = fakeAuthServer();
    const redirect =
      "http://127.0.0.1:4318/v1/integrations/custom/oauth/callback";
    const { state, authorizeUrl, attempt } = await beginCustomOAuth(
      DEF,
      redirect,
      null,
      { fetchFn },
    );
    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${AS}/authorize`);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("client_id")).toBe("houston-client");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toBe(redirect);
    expect(attempt.slug).toBe("acme");
    expect(attempt.endpoint).toBe(ENDPOINT);
    expect(attempt.codeVerifier).toBeTruthy();
    expect(attempt.resource).toBe("https://mcp.example.com");
  });

  it("asks for every advertised scope minus the definition's exclusions", async () => {
    const { fetchFn, calls } = fakeAuthServer();
    const redirect = "http://127.0.0.1:1/cb";
    const all = await beginCustomOAuth(DEF, redirect, null, { fetchFn });
    expect(new URL(all.authorizeUrl).searchParams.get("scope")).toBe(
      "mcp.read mcp.write",
    );
    // HighLevel's case: a scope the server lists but its consent page
    // refuses, which would fail the whole sign-in on that page.
    const { authorizeUrl } = await beginCustomOAuth(
      { ...DEF, oauthScopeExclusions: ["mcp.write", "not.advertised"] },
      redirect,
      null,
      { fetchFn },
    );
    expect(new URL(authorizeUrl).searchParams.get("scope")).toBe("mcp.read");
    // Registration asked for the same reduced scope.
    const registration = calls.filter((c) => c.url === `${AS}/register`).at(-1);
    expect(registration?.body).toContain('"scope":"mcp.read"');
    // Excluding everything sends no scope at all rather than an empty one.
    const { authorizeUrl: none } = await beginCustomOAuth(
      { ...DEF, oauthScopeExclusions: ["mcp.read", "mcp.write"] },
      redirect,
      null,
      { fetchFn },
    );
    expect(new URL(none).searchParams.has("scope")).toBe(false);
  });

  it("a state prefix rides inside the state (gateway pod routing)", async () => {
    const { fetchFn } = fakeAuthServer();
    const { state, authorizeUrl } = await beginCustomOAuth(
      DEF,
      "https://gateway.example.com/v1/integrations/custom/oauth/callback",
      null,
      { fetchFn, statePrefix: "30c8c1f5631f1312.36d2bd7e4d89085e" },
    );
    expect(state).toMatch(/^30c8c1f5631f1312\.36d2bd7e4d89085e\.[0-9a-f]{32}$/);
    expect(new URL(authorizeUrl).searchParams.get("state")).toBe(state);
  });

  it("refuses a non-https authorization endpoint (OS-opener safety)", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth-protected-resource")) {
        return jsonRes({
          resource: "https://mcp.example.com",
          authorization_servers: [AS],
        });
      }
      if (
        url.includes("oauth-authorization-server") ||
        url.includes("openid-configuration")
      ) {
        return jsonRes({
          ...METADATA,
          authorization_endpoint: "file:///etc/passwd",
        });
      }
      if (url === `${AS}/register`) {
        return jsonRes({ client_id: "c", redirect_uris: [] }, 201);
      }
      return jsonRes({ error: "no" }, 404);
    }) as typeof fetch;
    await expect(
      beginCustomOAuth(DEF, "http://127.0.0.1:1/cb", null, { fetchFn }),
    ).rejects.toMatchObject({ code: "oauth_failed" });
  });

  it("reuses a previously registered client for the same redirect", async () => {
    const { fetchFn, calls } = fakeAuthServer();
    const redirect =
      "http://127.0.0.1:4318/v1/integrations/custom/oauth/callback";
    const existing = {
      kind: "houston-custom-oauth" as const,
      version: 1 as const,
      authorizationServerUrl: AS,
      client: { client_id: "kept-client", redirect_uris: [redirect] },
      tokens: { access_token: "old", token_type: "Bearer" },
      expiresAt: null,
    };
    const { authorizeUrl } = await beginCustomOAuth(DEF, redirect, existing, {
      fetchFn,
    });
    expect(new URL(authorizeUrl).searchParams.get("client_id")).toBe(
      "kept-client",
    );
    expect(calls.some((c) => c.url === `${AS}/register`)).toBe(false);
  });

  it("a server that refuses registration fails with the typed code", async () => {
    const fetchFn = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth-protected-resource")) {
        return jsonRes({
          resource: "https://mcp.example.com",
          authorization_servers: [AS],
        });
      }
      if (
        url.includes("oauth-authorization-server") ||
        url.includes("openid-configuration")
      ) {
        return jsonRes({ ...METADATA, registration_endpoint: undefined });
      }
      return jsonRes({ error: "no" }, 404);
    }) as typeof fetch;
    await expect(
      beginCustomOAuth(DEF, "http://127.0.0.1:1/cb", null, { fetchFn }),
    ).rejects.toMatchObject({ code: "oauth_failed" });
  });
});

describe("settleCustomOAuth", () => {
  it("exchanges the code for a persistable bundle", async () => {
    const { fetchFn } = fakeAuthServer();
    const redirect =
      "http://127.0.0.1:4318/v1/integrations/custom/oauth/callback";
    const { attempt } = await beginCustomOAuth(DEF, redirect, null, {
      fetchFn,
    });
    const bundle = await settleCustomOAuth(attempt, "the-code", fetchFn);
    expect(bundle.kind).toBe("houston-custom-oauth");
    expect(bundle.tokens.access_token).toBe("at-1");
    expect(bundle.tokens.refresh_token).toBe("rt-1");
    expect(bundle.expiresAt).toBeGreaterThan(Date.now());
    expect(bundle.client.client_id).toBe("houston-client");
  });

  it("a rejected exchange fails with the typed code", async () => {
    const { fetchFn } = fakeAuthServer();
    const { attempt } = await beginCustomOAuth(
      DEF,
      "http://127.0.0.1:1/cb",
      null,
      { fetchFn },
    );
    const rejecting = (async () =>
      jsonRes({ error: "invalid_grant" }, 400)) as typeof fetch;
    await expect(
      settleCustomOAuth(attempt, "wrong-code", rejecting),
    ).rejects.toMatchObject({ code: "oauth_failed" });
  });
});
