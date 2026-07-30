import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(responses: unknown[]): {
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
      return new Response(JSON.stringify(responses.shift() ?? {}), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

describe("HoustonClient workspace-shared skills", () => {
  it("uses workspace-scoped CRUD routes and preserves response bodies", async () => {
    const list = { items: [], diagnostics: [] };
    const detail = {
      name: "brand-voice",
      title: null,
      description: "Use our voice",
      version: 1,
      content: "# Brand voice",
    };
    const { client, calls } = makeClient([list, detail, detail, {}, {}]);

    deepStrictEqual(await client.listSharedSkills("Work & Co"), list);
    deepStrictEqual(
      await client.loadSharedSkill("Work & Co", "brand/voice"),
      detail,
    );
    deepStrictEqual(
      await client.createSharedSkill("Work & Co", {
        workspacePath: "ignored-by-route",
        name: "Brand Voice",
        description: "Use our voice",
        content: "# Brand voice",
      }),
      detail,
    );
    await client.saveSharedSkill("Work & Co", "brand/voice", {
      workspacePath: "ignored-by-route",
      content: "# Updated",
    });
    await client.deleteSharedSkill("Work & Co", "brand/voice");

    deepStrictEqual(
      calls.map(({ method, url }) => ({ method, url })),
      [
        {
          method: "GET",
          url: "http://127.0.0.1:9999/v1/workspaces/Work%20%26%20Co/shared-skills",
        },
        {
          method: "GET",
          url: "http://127.0.0.1:9999/v1/workspaces/Work%20%26%20Co/shared-skills/brand%2Fvoice",
        },
        {
          method: "POST",
          url: "http://127.0.0.1:9999/v1/workspaces/Work%20%26%20Co/shared-skills",
        },
        {
          method: "PUT",
          url: "http://127.0.0.1:9999/v1/workspaces/Work%20%26%20Co/shared-skills/brand%2Fvoice",
        },
        {
          method: "DELETE",
          url: "http://127.0.0.1:9999/v1/workspaces/Work%20%26%20Co/shared-skills/brand%2Fvoice",
        },
      ],
    );
    deepStrictEqual(calls[2]?.body, {
      workspacePath: "ignored-by-route",
      name: "Brand Voice",
      description: "Use our voice",
      content: "# Brand voice",
    });
    deepStrictEqual(calls[3]?.body, {
      workspacePath: "ignored-by-route",
      content: "# Updated",
    });
  });

  it("scopes manifest GET/PUT exactly like the existing per-agent skills calls", async () => {
    const manifest = { version: 1 as const, enabled: ["brand-voice"] };
    const { client, calls } = makeClient([manifest, manifest]);

    deepStrictEqual(await client.getSkillsManifest("Work/Maya"), manifest);
    deepStrictEqual(
      await client.putSkillsManifest("Work/Maya", manifest),
      manifest,
    );

    strictEqual(
      calls[0]?.url,
      "http://127.0.0.1:9999/v1/skills-manifest?workspacePath=Work%2FMaya",
    );
    strictEqual(
      calls[1]?.url,
      "http://127.0.0.1:9999/v1/skills-manifest?workspacePath=Work%2FMaya",
    );
    strictEqual(calls[1]?.method, "PUT");
    deepStrictEqual(calls[1]?.body, manifest);
  });
});
