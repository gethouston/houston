import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";
import type { McpServerConfig } from "../src/types.ts";

/**
 * Remote MCP server integrations client surface (Element C): create/update POST
 * to `/v1/integrations/mcp/*`, carry the auth secret only in the request body
 * (`authValue`), and unwrap the gateway's `{ connection }` envelope to an
 * `IntegrationConnection`.
 *
 * A capturing `fetchImpl` records the outgoing `{method, url, body}` so we can
 * assert the exact wire request, and returns a canned `{ connection }` so the
 * unwrap side is covered too.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

const CONNECTION = {
  toolkit: "acme_tracker",
  connectionId: "acme_tracker",
  status: "active",
  accountLabel: "Acme Tracker",
};

function makeClient(): { client: HoustonClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify({ connection: CONNECTION }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const CONFIG: McpServerConfig & { authValue?: string } = {
  name: "Acme Tracker",
  url: "https://mcp.acme.example",
  auth: { type: "bearer" },
  description: "The Acme issue tracker MCP server",
  authValue: "mcp-secret",
};

describe("HoustonClient mcp servers — create", () => {
  it("POSTs the full config incl. authValue to /integrations/mcp/create", async () => {
    const { client, calls } = makeClient();
    const conn = await client.createMcpServer("mcp", CONFIG);
    strictEqual(calls.length, 1);
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/mcp/create",
    );
    deepStrictEqual(calls[0].body, CONFIG);
    // Unwraps the { connection } envelope.
    deepStrictEqual(conn, CONNECTION);
  });

  it("supports header-type auth carrying the header name", async () => {
    const { client, calls } = makeClient();
    await client.createMcpServer("mcp", {
      name: "Widgets",
      url: "https://mcp.widgets.example",
      auth: { type: "header", header: "X-Api-Key" },
      authValue: "k",
    });
    deepStrictEqual((calls[0].body as { auth: unknown }).auth, {
      type: "header",
      header: "X-Api-Key",
    });
  });

  it("supports none-type auth with no authValue", async () => {
    const { client, calls } = makeClient();
    await client.createMcpServer("mcp", {
      name: "Public",
      url: "https://mcp.public.example",
      auth: { type: "none" },
    });
    deepStrictEqual((calls[0].body as { auth: unknown }).auth, {
      type: "none",
    });
    strictEqual(Object.hasOwn(calls[0].body as object, "authValue"), false);
  });
});

describe("HoustonClient mcp servers — update", () => {
  it("POSTs {connectionId, ...patch} to /integrations/mcp/update", async () => {
    const { client, calls } = makeClient();
    const conn = await client.updateMcpServer("mcp", "acme_tracker", {
      name: "Acme (renamed)",
      authValue: "mcp-rotated",
    });
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/mcp/update",
    );
    deepStrictEqual(calls[0].body, {
      connectionId: "acme_tracker",
      name: "Acme (renamed)",
      authValue: "mcp-rotated",
    });
    deepStrictEqual(conn, CONNECTION);
  });

  it("omits authValue from the body when the patch does not set one (keep stored secret)", async () => {
    const { client, calls } = makeClient();
    await client.updateMcpServer("mcp", "acme_tracker", {
      description: "New description only",
    });
    deepStrictEqual(calls[0].body, {
      connectionId: "acme_tracker",
      description: "New description only",
    });
    strictEqual(Object.hasOwn(calls[0].body as object, "authValue"), false);
  });

  it("url-encodes the provider segment", async () => {
    const { client, calls } = makeClient();
    await client.createMcpServer("m cp", CONFIG);
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/m%20cp/create",
    );
  });
});
