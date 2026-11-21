import { describe, expect, it } from "vitest";
import { CustomOAuthAttempts } from "./oauth-attempts";
import {
  type CustomOAuthDeps,
  completeOAuthOp,
  completeOAuthWithAttempt,
  prepareOAuthOp,
  startOAuthOp,
} from "./oauth-ops";
import type { CustomIntegrationDef } from "./types";

const deps = (over: Partial<CustomOAuthDeps> = {}): CustomOAuthDeps =>
  ({
    store: {} as CustomOAuthDeps["store"],
    secrets: {} as CustomOAuthDeps["secrets"],
    host: {} as CustomOAuthDeps["host"],
    attempts: new CustomOAuthAttempts(),
    onChanged: () => undefined,
    ...over,
  }) as CustomOAuthDeps;

const mcpDef = (endpoint: string): CustomIntegrationDef => ({
  kind: "mcp",
  slug: "acme",
  name: "Acme",
  endpoint,
  auth: "oauth",
  addedAtMs: 1,
});

describe("startOAuthOp", () => {
  it("refuses where no callback exists (the capability is authoritative)", async () => {
    await expect(
      startOAuthOp(deps(), mcpDef("https://mcp.example.com")),
    ).rejects.toMatchObject({ code: "oauth_unsupported" });
  });

  it("refuses a non-MCP definition", async () => {
    const def: CustomIntegrationDef = {
      kind: "openapi",
      slug: "acme",
      name: "Acme",
      spec: { kind: "url", url: "https://acme.test/openapi.json" },
      auth: "none",
      addedAtMs: 1,
    };
    await expect(
      startOAuthOp(deps({ callbackUrl: "http://127.0.0.1:1/cb" }), def),
    ).rejects.toMatchObject({ code: "oauth_unsupported" });
  });
});

describe("completeOAuthOp", () => {
  const attempt = (endpoint: string) => ({
    slug: "acme",
    endpoint,
    codeVerifier: "v",
    redirectUri: "http://127.0.0.1:1/cb",
    authorizationServerUrl: "https://auth.example.com",
    client: { client_id: "c", redirect_uris: ["http://127.0.0.1:1/cb"] },
    expiresAtMs: Date.now() + 60_000,
  });

  it("an unknown state is refused before anything else runs", async () => {
    await expect(
      completeOAuthOp(
        deps(),
        () => Promise.reject(new Error("never")),
        "nope",
        "code",
      ),
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });

  it("a definition whose endpoint moved mid-flow never receives the tokens", async () => {
    const attempts = new CustomOAuthAttempts();
    attempts.put("s1", attempt("https://old.example.com/mcp"));
    await expect(
      completeOAuthOp(
        deps({ attempts }),
        async () => mcpDef("https://attacker.example.net/mcp"),
        "s1",
        "code",
      ),
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });
});

const callback =
  "https://gateway.example/v1/integrations/custom/oauth/callback";
const authFetch: typeof fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  let body: unknown = {};
  if (url.includes("oauth-protected-resource"))
    body = { authorization_servers: ["https://auth.example"] };
  else if (url.includes("oauth-authorization-server"))
    body = {
      issuer: "https://auth.example",
      authorization_endpoint: "https://auth.example/authorize",
      token_endpoint: "https://auth.example/token",
      registration_endpoint: "https://auth.example/register",
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    };
  else if (url.endsWith("/register"))
    body = { ...JSON.parse(String(init?.body)), client_id: "test-client" };
  else if (url.endsWith("/token"))
    body = { access_token: "test-access", token_type: "Bearer" };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
};

it("prepare returns a transferable attempt without taking host custody; start still takes custody", async () => {
  const attempts = new CustomOAuthAttempts();
  const dependencies = deps({
    attempts,
    callbackUrl: callback,
    statePrefix: "org.agent",
    fetchFn: authFetch,
    secrets: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
  });
  const prepared = await prepareOAuthOp(
    dependencies,
    mcpDef("https://mcp.example/mcp"),
  );
  expect(prepared.state).toMatch(/^org\.agent\.[0-9a-f]{32}$/);
  expect(prepared.attempt.redirectUri).toBe(callback);
  expect(attempts.take(prepared.state)).toBeNull();
  const started = await startOAuthOp(
    dependencies,
    mcpDef("https://mcp.example/mcp"),
  );
  expect(Object.keys(started)).toEqual(["authorizeUrl"]);
  const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";
  expect(attempts.take(state)?.slug).toBe("acme");
});

it("completion from a transferred attempt preserves the endpoint binding without a local state entry", async () => {
  const transferred = {
    slug: "acme",
    endpoint: "https://old.example/mcp",
    codeVerifier: "v",
    redirectUri: callback,
    authorizationServerUrl: "https://auth.example",
    client: { client_id: "c", redirect_uris: [callback] },
    expiresAtMs: Date.now() + 60_000,
  };
  await expect(
    completeOAuthWithAttempt(
      deps(),
      async () => mcpDef("https://changed.example/mcp"),
      transferred,
      "code",
    ),
  ).rejects.toMatchObject({ code: "oauth_state_invalid" });
});
