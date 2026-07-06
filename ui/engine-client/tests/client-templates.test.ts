import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";
import type { TemplateSpec } from "../src/types.ts";

/**
 * Teams v2 agent-template client surface (TEAMS-CONTRACT-E5 §client): the
 * list/get/create/delete methods, the optional `templateId` on `createAgent`,
 * and the 404-degrade-to-`[]`/`null` behavior on a non-Teams host.
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

const spec: TemplateSpec = {
  instructions: "Be helpful.",
  skills: [{ name: "greet", content: "Say hi." }],
  provider: "anthropic",
  model: "claude-opus-4",
  allowedToolkits: ["gmail"],
};

describe("HoustonClient templates — reads", () => {
  it("listOrgTemplates GETs /org/templates and unwraps templates", async () => {
    const templates = [
      {
        id: "t1",
        name: "Sales Agent",
        description: "",
        createdBy: "u1",
        createdAt: 5,
        skillCount: 3,
        model: "claude-opus-4",
        allowedToolkitCount: 2,
      },
    ];
    const { client, calls } = makeClient({ body: { templates } });
    const got = await client.listOrgTemplates();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/templates");
    deepStrictEqual(got, templates);
  });

  it("listOrgTemplates degrades to [] on a 404 (non-Teams host)", async () => {
    const { client } = makeClient({ status: 404, body: { error: {} } });
    deepStrictEqual(await client.listOrgTemplates(), []);
  });

  it("getOrgTemplate GETs /org/templates/:id and returns the record", async () => {
    const record = {
      id: "t1",
      orgId: "o1",
      name: "Sales Agent",
      description: "",
      createdBy: "u1",
      createdAt: 5,
      spec,
    };
    const { client, calls } = makeClient({ body: record });
    const got = await client.getOrgTemplate("t1");
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/templates/t1");
    deepStrictEqual(got, record);
  });

  it("getOrgTemplate degrades to null on a 404", async () => {
    const { client } = makeClient({ status: 404, body: { error: {} } });
    strictEqual(await client.getOrgTemplate("gone"), null);
  });
});

describe("HoustonClient templates — writes", () => {
  it("createOrgTemplate POSTs the {name, description, spec} body", async () => {
    const summary = {
      id: "t2",
      name: "Support Agent",
      description: "Answers tickets",
      createdBy: "u1",
      createdAt: 9,
      skillCount: 1,
      allowedToolkitCount: 1,
    };
    const { client, calls } = makeClient({ status: 201, body: summary });
    const input = {
      name: "Support Agent",
      description: "Answers tickets",
      spec,
    };
    const got = await client.createOrgTemplate(input);
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/templates");
    deepStrictEqual(calls[0].body, input);
    deepStrictEqual(got, summary);
  });

  it("deleteOrgTemplate DELETEs /org/templates/:id", async () => {
    const { client, calls } = makeClient({ body: { ok: true } });
    await client.deleteOrgTemplate("t2");
    strictEqual(calls[0].method, "DELETE");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/templates/t2");
  });
});

describe("HoustonClient createAgent — templateId", () => {
  it("forwards templateId in the create body when present", async () => {
    const { client, calls } = makeClient({ body: { agent: {} } });
    await client.createAgent("ws1", {
      name: "Rep 1",
      configId: "cfg",
      templateId: "t1",
    });
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/workspaces/ws1/agents");
    deepStrictEqual(calls[0].body, {
      name: "Rep 1",
      configId: "cfg",
      templateId: "t1",
    });
  });

  it("omits templateId for a plain create", async () => {
    const { client, calls } = makeClient({ body: { agent: {} } });
    await client.createAgent("ws1", { name: "Blank", configId: "cfg" });
    deepStrictEqual(calls[0].body, { name: "Blank", configId: "cfg" });
  });
});
