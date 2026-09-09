import { describe, expect, it } from "vitest";
import { beginCustomOAuth } from "./oauth-flow";
import type { CustomIntegrationDef } from "./types";

const ORIGIN = "https://service.example.com";
const ENDPOINT = `${ORIGIN}/functions/v1/mcp`;
const RESOURCE_METADATA = `${ENDPOINT}/.well-known/oauth-protected-resource`;
const ISSUER = `${ORIGIN}/auth/v1`;
const REDIRECT = "http://127.0.0.1:4318/v1/integrations/custom/oauth/callback";
const DEF: CustomIntegrationDef & { kind: "mcp" } = {
  kind: "mcp",
  slug: "service",
  name: "Service",
  endpoint: ENDPOINT,
  auth: "oauth",
  addedAtMs: 1,
};

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

type Discovery = "challenge" | "standard" | "legacy";

function server(discovery: Discovery, challenge?: string) {
  const calls: string[] = [];
  const issuer = discovery === "legacy" ? ORIGIN : ISSUER;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    if (url === ENDPOINT) {
      return json({ error: "unauthorized" }, 401, {
        "WWW-Authenticate":
          challenge ??
          `Bearer realm="mcp", resource_metadata="${RESOURCE_METADATA}"`,
      });
    }
    const resourceUrl =
      discovery === "standard"
        ? `${ORIGIN}/.well-known/oauth-protected-resource/functions/v1/mcp`
        : RESOURCE_METADATA;
    if (discovery !== "legacy" && url === resourceUrl) {
      return json({ resource: ENDPOINT, authorization_servers: [ISSUER] });
    }
    if (
      discovery !== "legacy" &&
      url === `${ORIGIN}/.well-known/oauth-authorization-server/auth/v1`
    ) {
      return json({
        issuer,
        authorization_endpoint: `${issuer}/oauth/authorize`,
        token_endpoint: `${issuer}/oauth/token`,
        registration_endpoint: `${issuer}/oauth/clients/register`,
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    const registration =
      discovery === "legacy"
        ? `${ORIGIN}/register`
        : `${issuer}/oauth/clients/register`;
    if (url === registration && init?.method === "POST") {
      return json(
        { client_id: "registered-client", redirect_uris: [REDIRECT] },
        201,
      );
    }
    return json({ error: "not_found" }, 404);
  };
  return { fetchFn, calls };
}

describe("custom MCP OAuth discovery compatibility", () => {
  it("follows the challenge when metadata is only available at an advertised URL", async () => {
    const { fetchFn, calls } = server("challenge");
    const result = await beginCustomOAuth(DEF, REDIRECT, null, { fetchFn });
    const url = new URL(result.authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/oauth/authorize`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe(ENDPOINT);
    expect(result.attempt.authorizationServerUrl).toBe(ISSUER);
    expect(calls).toContain(RESOURCE_METADATA);
    expect(calls).toContain(`${ISSUER}/oauth/clients/register`);
    expect(calls).not.toContain(`${ORIGIN}/register`);
  });

  it("keeps standard discovery without probing the MCP endpoint", async () => {
    const { fetchFn, calls } = server("standard");
    const result = await beginCustomOAuth(DEF, REDIRECT, null, { fetchFn });
    expect(result.attempt.authorizationServerUrl).toBe(ISSUER);
    expect(calls).not.toContain(ENDPOINT);
    expect(calls).not.toContain(RESOURCE_METADATA);
  });

  it.each([
    'Bearer realm="mcp"',
    'Bearer resource_metadata="not-a-url"',
  ])("preserves legacy registration when no usable hint is provided: %s", async (challenge) => {
    const { fetchFn, calls } = server("legacy", challenge);
    const result = await beginCustomOAuth(DEF, REDIRECT, null, { fetchFn });
    expect(new URL(result.authorizeUrl).pathname).toBe("/authorize");
    expect(calls).toContain(`${ORIGIN}/register`);
  });

  it.each([
    200, 405,
  ])("preserves legacy fallback on an MCP GET returning %s", async (status) => {
    const original = server("legacy");
    let cancelled = false;
    const fetchFn: typeof fetch = async (input, init) => {
      if (String(input) !== ENDPOINT) return original.fetchFn(input, init);
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        {
          status,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_METADATA}"`,
          },
        },
      );
    };
    const result = await beginCustomOAuth(DEF, REDIRECT, null, { fetchFn });
    expect(new URL(result.authorizeUrl).pathname).toBe("/authorize");
    expect(cancelled).toBe(true);
    expect(original.calls).not.toContain(RESOURCE_METADATA);
  });

  it("uses configured headers on the probe and reports transport failures", async () => {
    const original = server("legacy");
    const fetchFn: typeof fetch = async (input, init) => {
      if (String(input) !== ENDPOINT) return original.fetchFn(input, init);
      expect(new Headers(init?.headers).get("x-tenant")).toBe("workspace");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new Error("probe unavailable");
    };
    await expect(
      beginCustomOAuth(
        { ...DEF, headers: { "x-tenant": "workspace" } },
        REDIRECT,
        null,
        { fetchFn },
      ),
    ).rejects.toMatchObject({
      code: "oauth_failed",
      message: "could not discover how Service signs in: probe unavailable",
    });
  });
});
