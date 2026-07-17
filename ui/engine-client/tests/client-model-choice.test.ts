import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

/**
 * Teams v2 model surface (TEAMS-CONTRACT-E8 §Change3): the agent `allowedModels`
 * ceiling carried on agent settings, and the per-user model-choice
 * get/set (`GET`/`PUT /agents/:slug/model-choice`) incl. the 404-degrade on a
 * non-Teams host.
 *
 * A capturing `fetchImpl` records the outgoing `{method, url, body}` so we can
 * assert the exact wire request, and returns a canned body (or a 404) so the
 * parse/unwrap and degrade paths are covered.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(response: { status?: number; body?: unknown } = {}): {
  client: HoustonClient;
  calls: Captured[];
} {
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
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

describe("HoustonClient — agent settings allowedModels", () => {
  it("getAgentSettings returns allowedModels alongside the toolkits", async () => {
    const settings = {
      allowedToolkits: ["gmail"],
      access: "manager",
      allowedModels: ["claude-opus-4-8", "gpt-5.5"],
    };
    const { client, calls } = makeClient({ body: settings });
    const got = await client.getAgentSettings("agent-1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/settings",
    );
    deepStrictEqual(got, settings);
  });

  it("setAgentSettings PUTs an allowedModels-only body", async () => {
    const { client, calls } = makeClient();
    await client.setAgentSettings("agent-1", {
      allowedModels: ["claude-opus-4-8"],
    });
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/settings",
    );
    deepStrictEqual(calls[0].body, {
      allowedModels: ["claude-opus-4-8"],
    });
  });

  it("setAgentSettings PUTs a null allowedModels body (all allowed)", async () => {
    const { client, calls } = makeClient();
    await client.setAgentSettings("agent-1", { allowedModels: null });
    deepStrictEqual(calls[0].body, { allowedModels: null });
  });
});

describe("HoustonClient — per-user model choice", () => {
  it("getAgentModelChoice GETs /model-choice and returns choice + ceiling", async () => {
    const info = {
      choice: { provider: "anthropic", model: "claude-opus-4-8" },
      allowedModels: ["claude-opus-4-8", "gpt-5.5"],
    };
    const { client, calls } = makeClient({ body: info });
    const got = await client.getAgentModelChoice("agent-1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/model-choice",
    );
    deepStrictEqual(got, info);
  });

  it("getAgentModelChoice degrades to null on a 404 (non-Teams host)", async () => {
    const { client } = makeClient({ status: 404, body: { error: {} } });
    strictEqual(await client.getAgentModelChoice("agent-1"), null);
  });

  it("setAgentModelChoice PUTs the {provider, model, effort} body", async () => {
    const { client, calls } = makeClient();
    await client.setAgentModelChoice("agent-1", {
      provider: "anthropic",
      model: "claude-opus-4-8",
      effort: "high",
    });
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/model-choice",
    );
    deepStrictEqual(calls[0].body, {
      provider: "anthropic",
      model: "claude-opus-4-8",
      effort: "high",
    });
  });
});
