import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";
import type { CustomIntegrationConfig } from "../src/types.ts";

/**
 * Custom API-key integrations client surface (Element B): create/update POST to
 * `/v1/integrations/custom/*`, carry the key only in the request body, and
 * unwrap the gateway's `{ connection }` envelope to an `IntegrationConnection`.
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
  toolkit: "acme_crm",
  connectionId: "acme_crm",
  status: "active",
  accountLabel: "Acme CRM",
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

const CONFIG: CustomIntegrationConfig & { apiKey: string } = {
  name: "Acme CRM",
  baseUrl: "https://api.acme.example",
  auth: { type: "header", header: "Authorization", prefix: "Bearer " },
  description: "The Acme CRM API",
  apiKey: "sk-secret",
};

describe("HoustonClient custom integrations — create", () => {
  it("POSTs the full config incl. apiKey to /integrations/custom/create", async () => {
    const { client, calls } = makeClient();
    const conn = await client.createCustomIntegration("custom", CONFIG);
    strictEqual(calls.length, 1);
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/custom/create",
    );
    deepStrictEqual(calls[0].body, CONFIG);
    // Unwraps the { connection } envelope.
    deepStrictEqual(conn, CONNECTION);
  });

  it("supports query-type auth without a prefix", async () => {
    const { client, calls } = makeClient();
    await client.createCustomIntegration("custom", {
      name: "Weather",
      baseUrl: "https://api.weather.example",
      auth: { type: "query", param: "apikey" },
      description: "Weather data",
      apiKey: "k",
    });
    deepStrictEqual((calls[0].body as { auth: unknown }).auth, {
      type: "query",
      param: "apikey",
    });
  });
});

describe("HoustonClient custom integrations — update", () => {
  it("POSTs {connectionId, ...patch} to /integrations/custom/update", async () => {
    const { client, calls } = makeClient();
    const conn = await client.updateCustomIntegration("custom", "acme_crm", {
      name: "Acme (renamed)",
      apiKey: "sk-rotated",
    });
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/custom/update",
    );
    deepStrictEqual(calls[0].body, {
      connectionId: "acme_crm",
      name: "Acme (renamed)",
      apiKey: "sk-rotated",
    });
    deepStrictEqual(conn, CONNECTION);
  });

  it("omits apiKey from the body when the patch does not set one (keep stored key)", async () => {
    const { client, calls } = makeClient();
    await client.updateCustomIntegration("custom", "acme_crm", {
      description: "New description only",
    });
    deepStrictEqual(calls[0].body, {
      connectionId: "acme_crm",
      description: "New description only",
    });
    strictEqual(Object.hasOwn(calls[0].body as object, "apiKey"), false);
  });

  it("url-encodes the provider segment", async () => {
    const { client, calls } = makeClient();
    await client.createCustomIntegration("cus tom", CONFIG);
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/cus%20tom/create",
    );
  });
});
