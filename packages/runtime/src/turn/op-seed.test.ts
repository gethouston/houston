import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAMILIES, schemaKey } from "@houston/domain";
import { expect, test, vi } from "vitest";
import type { SeedOp } from "./op-grammar-seed";
import { executeSeedOp } from "./op-seed";
import {
  docRoute,
  generationStore,
  PREFIX,
  seedRequest,
} from "./op-seed.test-support";
import type { OpRequest } from "./parse-op-request";

const AGENT_OPS = "agent-ops";

const BASELINE = [{ id: "anthropic", configured: false }];
const cleanViews = (
  dataDir = mkdtempSync(join(tmpdir(), "op-seed-data-")),
) => ({
  providers: () => BASELINE,
  providerUsage: async () => [],
  dataDir,
});

async function runSeed(
  op: Omit<SeedOp, "kind">,
  fake = generationStore(),
  docs = docRoute(),
  actingAs?: OpRequest["actingAs"],
  views = cleanViews(),
) {
  const request = seedRequest(op, actingAs);
  const reply = await executeSeedOp({
    deps: docs.deps,
    op: request,
    turn: { ...request, conversationId: AGENT_OPS },
    store: fake.store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "op-seed-root-")),
    fenced: async () => false,
    views,
  });
  return { reply, fake, docs };
}

const FAMILY_DOCS = [
  "activity",
  "config",
  "learnings",
  "routine_runs",
  "routines",
];
const familyDocs = (puts: { family: string; doc: unknown }[]) =>
  Object.fromEntries(
    puts
      .filter((put) => FAMILY_DOCS.includes(put.family))
      .map((put) => [put.family, put.doc]),
  );

function answer(reply: { status: number; body: unknown }) {
  expect(reply.status).toBe(200);
  const envelope = reply.body as { status: number; body: string };
  return { status: envelope.status, body: JSON.parse(envelope.body) };
}

const schemaRels = (agentRel: string) =>
  FAMILIES.map((family) => schemaKey(agentRel, family)).sort();

test("an empty prefix is seeded create-only as the pod creates an agent, and its five docs are published", async () => {
  const { reply, fake, docs } = await runSeed({ name: "Ledger" });
  expect(answer(reply)).toEqual({
    status: 201,
    body: { id: "Personal/Ledger", adopted: false },
  });
  expect((await fake.keys()).sort()).toEqual(
    schemaRels("workspaces/Personal/Ledger"),
  );
  expect(fake.uploads.length).toBeGreaterThan(0);
  for (const upload of fake.uploads)
    expect(upload.ifGenerationMatch, upload.key).toBe("0");
  expect(familyDocs(docs.puts)).toEqual({
    activity: [],
    routines: [],
    routine_runs: [],
    learnings: [],
    config: {},
  });
  for (const put of docs.puts)
    expect(put.headers.get("X-Houston-Claim-Conversation")).toBe(AGENT_OPS);
});

test("one agent tree is adopted as it is: its id, nothing written, no doc touched", async () => {
  const fake = generationStore();
  fake.put("workspaces/Personal/Bob/CLAUDE.md", "# Bob\n");
  fake.put("workspaces/Personal/Bob/reports/q1.csv", "a,b\n");
  const { reply, docs } = await runSeed({ name: "Ledger" }, fake);
  expect(answer(reply)).toEqual({
    status: 200,
    body: { id: "Personal/Bob", adopted: true },
  });
  expect(fake.uploads).toEqual([]);
  expect(docs.puts).toEqual([]);
});

test("the drain stamp and the preferences namespace do not stop a seed", async () => {
  const fake = generationStore();
  fake.put(".houston-drain.json", '{"since":1,"until":1}');
  fake.put("workspaces/ws/acme/preferences.json", "{}");
  fake.put("workspaces/ws/acme/.houston/runtime/runtime.log", "boot\n");
  const { reply } = await runSeed({ name: "Ledger" }, fake);
  expect(answer(reply)).toEqual({
    status: 201,
    body: { id: "Personal/Ledger", adopted: false },
  });
  expect(await fake.keys()).toEqual(
    expect.arrayContaining(schemaRels("workspaces/Personal/Ledger")),
  );
});

test("objects without an agent tree, two trees or a per-turn layout are refused untouched", async () => {
  const layouts: Record<string, string[]> = {
    stray: ["custom-integrations.json"],
    "two trees": [
      "workspaces/Personal/Bob/CLAUDE.md",
      "workspaces/Personal/Ann/CLAUDE.md",
    ],
    "per-turn": ["data/conversations/c1.json", "workspace/notes.md"],
  };
  for (const [label, rels] of Object.entries(layouts)) {
    const fake = generationStore();
    for (const rel of rels) fake.put(rel, "{}");
    const { reply, docs } = await runSeed({ name: "Ledger" }, fake);
    expect(answer(reply), label).toEqual({
      status: 409,
      body: { error: "agent data restore pending", code: "restore_pending" },
    });
    expect(fake.uploads, label).toEqual([]);
    expect(docs.puts, label).toEqual([]);
  }
});

test("CLAUDE.md and the seeds land, seeded routines stamped with the acting user", async () => {
  const routines = [
    {
      id: "r1",
      name: "Close",
      prompt: "close the books",
      schedule: "0 9 * * 1",
    },
  ];
  const { reply, fake, docs } = await runSeed(
    {
      name: "Ledger",
      claudeMd: "# Ledger\n",
      seeds: {
        ".agents/skills/close/SKILL.md": "---\nname: Close\n---\n",
        ".houston/routines/routines.json": JSON.stringify(routines),
      },
    },
    generationStore(),
    docRoute(),
    { userId: "user-7" },
  );
  expect(answer(reply).status).toBe(201);
  const agent = "workspaces/Personal/Ledger";
  expect(fake.read(`${agent}/CLAUDE.md`)).toBe("# Ledger\n");
  expect(fake.read(`${agent}/.agents/skills/close/SKILL.md`)).toContain(
    "name: Close",
  );
  expect(
    JSON.parse(fake.read(`${agent}/.houston/routines/routines.json`)),
  ).toEqual([{ ...routines[0], created_by: "user-7" }]);
  const routinesDoc = docs.puts.find((put) => put.family === "routines");
  expect(routinesDoc?.doc).toEqual([
    expect.objectContaining({ id: "r1", created_by: "user-7" }),
  ]);
});

test("a seed that loses the race to another seeder adopts the winner's tree, never overwriting it", async () => {
  const fake = generationStore();
  const winner = "workspaces/Personal/Ledger/CLAUDE.md";
  fake.hooks.beforeUpload = (key) => {
    if (fake.hooks.beforeUpload && key.endsWith("/CLAUDE.md")) {
      fake.hooks.beforeUpload = undefined;
      fake.put(winner, "# the winner\n");
    }
  };
  const { reply } = await runSeed(
    { name: "Ledger", claudeMd: "# ours\n" },
    fake,
  );
  const { status, body } = answer(reply);
  expect(status).toBe(200);
  expect(body).toMatchObject({ id: "Personal/Ledger", adopted: true });
  expect(fake.read(winner)).toBe("# the winner\n");
  expect(await fake.keys()).toEqual(
    expect.arrayContaining(schemaRels("workspaces/Personal/Ledger")),
  );
});

test("an adopted tree with a payload gets only the files it lacks, create-only", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  const [firstSchema = ""] = schemaRels(agent);
  fake.put(`${agent}/CLAUDE.md`, "# edited since\n");
  fake.put(firstSchema, '{"kept":true}');
  const { reply, docs } = await runSeed(
    {
      name: "Ledger",
      claudeMd: "# Ledger\n",
      seeds: { "notes.md": "hello\n" },
    },
    fake,
  );
  const written = [...schemaRels(agent).slice(1), `${agent}/notes.md`];
  expect(answer(reply)).toEqual({
    status: 200,
    body: { id: "Personal/Ledger", adopted: true, completed: written.length },
  });
  expect(
    fake.uploads.map((u) => u.key.slice(PREFIX.length + 1)).sort(),
  ).toEqual(written.sort());
  for (const upload of fake.uploads) expect(upload.ifGenerationMatch).toBe("0");
  expect(fake.read(`${agent}/CLAUDE.md`)).toBe("# edited since\n");
  expect(fake.read(firstSchema)).toBe('{"kept":true}');
  expect(Object.keys(familyDocs(docs.puts)).sort()).toEqual(FAMILY_DOCS);
});

test("a complete adopted tree with a payload writes nothing and publishes nothing", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  for (const rel of schemaRels(agent)) fake.put(rel, "{}");
  fake.put(`${agent}/CLAUDE.md`, "# Ledger\n");
  fake.put(`${agent}/notes.md`, "changed\n");
  const { reply, docs } = await runSeed(
    {
      name: "Ledger",
      claudeMd: "# Ledger\n",
      seeds: { "notes.md": "hello\n" },
    },
    fake,
  );
  expect(answer(reply)).toEqual({
    status: 200,
    body: { id: "Personal/Ledger", adopted: true, completed: 0 },
  });
  expect(fake.uploads).toEqual([]);
  expect(docs.puts).toEqual([]);
  expect(fake.read(`${agent}/notes.md`)).toBe("changed\n");
});

test("a seed carrying runtime files is the pod's: declined before anything is written", async () => {
  const { reply, fake } = await runSeed({
    name: "Ledger",
    seeds: { ".houston/runtime/settings.json": "{}" },
  });
  expect(reply).toEqual({ status: 200, body: { ok: true, decline: true } });
  expect(fake.uploads).toEqual([]);
});

test("a fenced claim writes nothing", async () => {
  const fake = generationStore();
  const request = seedRequest({ name: "Ledger" });
  const reply = await executeSeedOp({
    deps: docRoute().deps,
    op: request,
    turn: { ...request, conversationId: AGENT_OPS },
    store: fake.store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "op-seed-root-")),
    fenced: async () => true,
  });
  expect(reply).toEqual({ status: 409, body: { error: "claim_fenced" } });
  expect(await fake.keys()).toEqual([]);
});

test("a seed publishes the skills, providers and provider usage views a new pod would serve", async () => {
  const { docs } = await runSeed({
    name: "Ledger",
    seeds: {
      ".agents/skills/close/SKILL.md":
        "---\nname: close\ndescription: Close the books\n---\nDo it.\n",
    },
  });
  const views = Object.fromEntries(
    docs.puts
      .filter((put) => !FAMILY_DOCS.includes(put.family))
      .map((put) => [put.family, put.doc]),
  );
  expect(Object.keys(views).sort()).toEqual([
    "provider_usage",
    "providers",
    "skills",
  ]);
  expect(views.providers).toEqual(BASELINE);
  expect(views.provider_usage).toEqual([]);
  expect(JSON.stringify(views.skills)).toContain("Close the books");
});

test("a worker whose own config dir holds agent state publishes no provider views", async () => {
  const dirty = mkdtempSync(join(tmpdir(), "op-seed-dirty-"));
  writeFileSync(join(dirty, "settings.json"), "{}");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const { reply, docs } = await runSeed(
      { name: "Ledger" },
      generationStore(),
      docRoute(),
      undefined,
      cleanViews(dirty),
    );
    expect(answer(reply).status).toBe(201);
    const families = docs.puts.map((put) => put.family);
    expect(families).toContain("skills");
    expect(families).not.toContain("providers");
    expect(families).not.toContain("provider_usage");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("settings.json"));
  } finally {
    warn.mockRestore();
  }
});

test("a payload file that collides with a path the tree holds is skipped, never stacked on it", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  for (const rel of schemaRels(agent)) fake.put(rel, "{}");
  fake.put(`${agent}/notes`, "a file\n");
  fake.put(`${agent}/docs/a.md`, "kept\n");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const { reply } = await runSeed(
      {
        name: "Ledger",
        seeds: { "notes/child.md": "x\n", docs: "y\n", "fine.md": "z\n" },
      },
      fake,
    );
    expect(answer(reply).body).toMatchObject({ adopted: true, completed: 1 });
    expect(fake.uploads.map((u) => u.key)).toEqual([
      `${PREFIX}/${agent}/fine.md`,
    ]);
  } finally {
    warn.mockRestore();
  }
});

test("a young agent's adopt republishes what a crashed seed never projected", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  for (const rel of schemaRels(agent)) fake.put(rel, "{}");
  fake.put(`${agent}/CLAUDE.md`, "# Ledger\n");
  const { reply, docs } = await runSeed(
    { name: "Ledger", republish: true },
    fake,
  );
  expect(answer(reply).body).toEqual({ id: "Personal/Ledger", adopted: true });
  expect(fake.uploads).toEqual([]);
  const families = docs.puts.map((put) => put.family).sort();
  expect(families).toEqual(
    [...FAMILY_DOCS, "provider_usage", "providers", "skills"].sort(),
  );
});

test("an adopt that republishes never publishes the baseline over an agent's own provider state", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  for (const rel of schemaRels(agent)) fake.put(rel, "{}");
  fake.put(`${agent}/.houston/runtime/settings.json`, '{"activeProvider":"x"}');
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    const { docs } = await runSeed({ name: "Ledger", republish: true }, fake);
    const families = docs.puts.map((put) => put.family);
    expect(families).toContain("skills");
    expect(families).not.toContain("providers");
    expect(families).not.toContain("provider_usage");
  } finally {
    warn.mockRestore();
  }
});

test("an adopt keeps an agent's existing provider views and fills only missing ones", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  for (const rel of schemaRels(agent)) fake.put(rel, "{}");
  const docs = docRoute(200, ["providers"]);
  const { reply } = await runSeed(
    { name: "Ledger", republish: true },
    fake,
    docs,
  );
  expect(answer(reply).body).toEqual({ id: "Personal/Ledger", adopted: true });
  const families = docs.puts.map((put) => put.family);
  expect(families).not.toContain("providers");
  expect(families).toContain("provider_usage");
  expect(families).toContain("skills");
});

test("a projection that throws after a durable seed is logged, never a failed seed", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const { reply, fake } = await runSeed(
      { name: "Ledger" },
      generationStore(),
      docRoute("throw"),
    );
    expect(answer(reply)).toMatchObject({ status: 201 });
    expect(await fake.keys()).toEqual(
      expect.arrayContaining(schemaRels("workspaces/Personal/Ledger")),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("seed projection failed"),
    );
  } finally {
    error.mockRestore();
  }
});

test("an adopted flat-layout tree never gets a family file over its flat twin", async () => {
  const fake = generationStore();
  const agent = "workspaces/Personal/Ledger";
  fake.put(`${agent}/CLAUDE.md`, "# Ledger\n");
  fake.put(`${agent}/.houston/routines.json`, '[{"id":"r1"}]');
  const { reply } = await runSeed(
    {
      name: "Ledger",
      seeds: { ".houston/routines/routines.json": "[]", "notes.md": "hi\n" },
    },
    fake,
  );
  expect(answer(reply).status).toBe(200);
  const uploaded = fake.uploads.map((u) => u.key.slice(PREFIX.length + 1));
  expect(uploaded).not.toContain(`${agent}/.houston/routines/routines.json`);
  expect(uploaded).toContain(`${agent}/notes.md`);
});
