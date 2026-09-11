import { describe, expect, it } from "vitest";
import { detectSource } from "./detect";
import type { CustomExecutor } from "./executor-host";

const ORIGIN = "https://service.example.com";
const ENDPOINT = `${ORIGIN}/functions/v1/mcp`;
const RESOURCE_METADATA = `${ENDPOINT}/.well-known/oauth-protected-resource`;
const ISSUER = `${ORIGIN}/auth/v1`;

const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** A Supabase-shaped gateway: every guessed well-known path answers 401 (the
 *  executor's probe reads that as "no OAuth"); only the endpoint's
 *  WWW-Authenticate hint leads to the real metadata. */
const gatewayFetch: typeof fetch = async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === ENDPOINT) {
    return json({ error: "unauthorized" }, 401, {
      "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${RESOURCE_METADATA}"`,
    });
  }
  if (url === RESOURCE_METADATA) {
    return json({ resource: ENDPOINT, authorization_servers: [ISSUER] });
  }
  if (url === `${ORIGIN}/.well-known/oauth-authorization-server/auth/v1`) {
    return json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      registration_endpoint: `${ISSUER}/oauth/clients/register`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
    });
  }
  return json({ message: "No API key found in request" }, 401);
};

const keyOnlyFetch: typeof fetch = async () =>
  json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });

type Probe = Awaited<ReturnType<CustomExecutor["mcp"]["probeEndpoint"]>>;

function executorWith(probe: Partial<Probe>): CustomExecutor {
  // The probe output is a union of literal shapes; the fake merges over the
  // auth-wall default, so it is asserted rather than narrowed.
  const full = {
    connected: false,
    requiresAuthentication: true,
    requiresOAuth: false,
    supportsDynamicRegistration: false,
    name: "service.example.com",
    slug: "service-example-com",
    toolCount: null,
    serverName: null,
    instructions: null,
    ...probe,
  } as Probe;
  return {
    integrations: { detect: async () => [] },
    mcp: { probeEndpoint: async () => full },
  } as unknown as CustomExecutor;
}

describe("detectSource: OAuth wall the executor probe could not explain", () => {
  it("reads an auth wall as OAuth when the endpoint's own discovery finds an authorization server", async () => {
    const result = await detectSource(executorWith({}), ENDPOINT, {
      fetchFn: gatewayFetch,
    });
    expect(result).toMatchObject({
      kind: "mcp",
      requiresAuthentication: true,
      requiresOAuth: true,
    });
  });

  it("keeps the API-key verdict when discovery finds nothing", async () => {
    const result = await detectSource(executorWith({}), ENDPOINT, {
      fetchFn: keyOnlyFetch,
    });
    expect(result).toMatchObject({ kind: "mcp", requiresAuthentication: true });
    expect(result.requiresOAuth).toBeUndefined();
  });

  it("keeps the API-key verdict when discovery itself fails", async () => {
    const failing: typeof fetch = async () => {
      throw new Error("offline");
    };
    const result = await detectSource(executorWith({}), ENDPOINT, {
      fetchFn: failing,
    });
    expect(result.requiresOAuth).toBeUndefined();
  });

  it("never runs discovery for an open server", async () => {
    let calls = 0;
    const counting: typeof fetch = async (input) => {
      calls += 1;
      return gatewayFetch(input);
    };
    const result = await detectSource(
      executorWith({
        connected: true,
        requiresAuthentication: false,
        toolCount: 4,
        serverName: "Open",
      }),
      ENDPOINT,
      { fetchFn: counting },
    );
    expect(result).toMatchObject({ kind: "mcp", name: "Open", toolCount: 4 });
    expect(result.requiresOAuth).toBeUndefined();
    expect(calls).toBe(0);
  });

  it("trusts the executor's own OAuth verdict without a second discovery", async () => {
    let calls = 0;
    const counting: typeof fetch = async (input) => {
      calls += 1;
      return gatewayFetch(input);
    };
    const result = await detectSource(
      executorWith({ requiresOAuth: true, supportsDynamicRegistration: true }),
      ENDPOINT,
      { fetchFn: counting },
    );
    expect(result.requiresOAuth).toBe(true);
    expect(calls).toBe(0);
  });
});
