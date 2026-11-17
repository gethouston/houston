import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { viewOf } from "@houston/host/src/integrations/custom/views";
import { expect, test } from "vitest";
import { publishCustomDefinitionsView } from "./turn-custom-definitions-doc";
import { landOp } from "./turn-views-op.test-support";
import {
  type AgentStore,
  agentStore,
  docTargetFor,
  holdFirstGet,
  PREFIX,
  podDocs,
  seed,
} from "./turn-views.test-support";

/**
 * The gateway serves a sleeping agent's custom integrations list from the
 * custom_definitions view doc. Every pooled writer that changes a definition
 * republishes it, so these pin that a publish never drops an integration
 * another writer added, never brings back one it removed, and never puts an
 * older copy of one back.
 */

/** A keyless OpenAPI document the worker compiles with no network. */
const spec = (title: string) =>
  JSON.stringify({
    openapi: "3.0.0",
    info: { title, version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
      "/items": {
        get: {
          operationId: "listItems",
          responses: { "200": { description: "ok" } },
        },
      },
    },
  });

const add = (name: string) => ({
  method: "POST",
  rest: "integrations/custom/definitions",
  body: { kind: "openapi", name, spec: spec(name), auth: "none" },
});

type View = { items: { slug: string; name: string }[] };
const slugs = (doc: unknown) => (doc as View).items.map((item) => item.slug);

async function storedSlugs(agent: AgentStore) {
  const raw = await readFile(
    join(agent.prefixRoot, "custom-integrations.json"),
    "utf8",
  );
  return (JSON.parse(raw) as View).items.map((item) => item.slug);
}

test("an op whose add lost the race to another add keeps both in the view", async () => {
  // The second op listed the store before the first one landed: its own
  // re-captured list lacks the first op's integration.
  const agent = await agentStore();
  const docs = podDocs();
  const second = await landOp(agent, docs, add("Gadgets"), {
    beforeSync: async () => {
      const first = await landOp(agent, docs, add("Widgets"));
      await first();
    },
  });
  const announced = await second();

  expect(await storedSlugs(agent)).toEqual(["widgets", "gadgets"]);
  expect(slugs(docs.doc("custom_definitions"))).toEqual(["widgets", "gadgets"]);
  expect(announced).toContain("CustomIntegrationsChanged");
});

test("an integration another op removed stays out of the file and the view", async () => {
  const agent = await agentStore();
  const docs = podDocs();
  await (
    await landOp(agent, docs, add("Old"))
  )();
  const adding = await landOp(agent, docs, add("Gadgets"), {
    beforeSync: async () => {
      const remove = await landOp(agent, docs, {
        method: "DELETE",
        rest: "integrations/custom/definitions/old",
      });
      await remove();
    },
  });
  await adding();

  expect(await storedSlugs(agent)).toEqual(["gadgets"]);
  expect(slugs(docs.doc("custom_definitions"))).toEqual(["gadgets"]);
});

test("a late publisher never puts back the name another op changed since", async () => {
  // The add publishes late: a rename lands and publishes first. The add's
  // re-captured entry carries the old name and must not be what lands.
  const gate = holdFirstGet("custom_definitions", "agent-ops");
  const agent = await agentStore();
  const docs = podDocs({}, { hold: gate.hold });
  const adding = await landOp(agent, docs, add("Widgets"));
  const published = adding();
  await gate.atGet;
  const rename = await landOp(agent, docs, {
    method: "PATCH",
    rest: "integrations/custom/definitions/widgets",
    body: { name: "Widgets Pro", website: "" },
  });
  await rename();
  gate.release();
  await published;

  expect((docs.doc("custom_definitions") as View).items).toEqual([
    expect.objectContaining({ slug: "widgets", name: "Widgets Pro" }),
  ]);
});

test("a late capture of an older definition never overwrites the state of the newer one", async () => {
  // A turn added the integration and captured it waiting for a credential.
  // An op then saved the credential and published it connected. The turn
  // publishes late: its capture is of the definition before the credential,
  // which the view alone cannot tell apart.
  const agent = await agentStore();
  const added = {
    kind: "mcp" as const,
    slug: "crm",
    name: "CRM",
    endpoint: "https://mcp.crm.test",
    auth: "credential" as const,
    addedAtMs: 1,
  };
  const connected = {
    ...added,
    credential: { template: "bearer", secretIds: { token: "s1" } },
  };
  await seed(
    agent.prefixRoot,
    "custom-integrations.json",
    JSON.stringify({ version: 1, items: [connected] }),
  );
  const active = viewOf(connected, { status: "active", toolCount: 3 }, []);
  const docs = podDocs({ custom_definitions: { items: [active] } });

  const outcome = await publishCustomDefinitionsView(
    docTargetFor(docs, "custom_definitions"),
    { store: agent.store, prefix: PREFIX },
    {
      view: {
        items: [viewOf(added, { status: "pending", authMethods: [] }, [])],
      },
      touched: new Set(["crm"]),
      defs: [added],
    },
  );

  expect(outcome).toEqual({ ok: true });
  expect(docs.doc("custom_definitions")).toEqual({ items: [active] });
});
