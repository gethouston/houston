import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { WorkerOpDeclinedError } from "./op-provider-guard";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const noopTurn: TurnRunner = async () => ({});

async function seedAgent(): Promise<{
  storeRoot: string;
  agentId: string;
  prefix: string;
}> {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-store-"));
  const prefix = "ws/w1/agent-1";
  const workspaces = join(storeRoot, prefix, "workspaces");
  const store = new LocalWorkspaceStore(workspaces);
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Bob" });
  const agentDir = join(workspaces, ...agent.id.split("/"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agentDir, "report.csv"), "a,b\n1,2\n");
  const runtime = join(agentDir, ".houston", "runtime", "conversations");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, "c1.json"), "{}");
  return { storeRoot, agentId: agent.id, prefix };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

function opBody(_agentId: string, heartbeatUrl: string, op: unknown) {
  return {
    workspaceId: "w1",
    agentId: "agent-1",
    gcsPrefix: "ws/w1/agent-1",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl,
    },
    actingAs: { userId: "user-1" },
    triggersEnabled: false,
    op,
  };
}

async function postOp(base: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const result = await postOpOnce(base, body);
    if (
      result.status !== 503 ||
      result.json.error !== "worker_full" ||
      attempt > 40
    ) {
      return result;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function postOpOnce(base: string, body: unknown) {
  const response = await fetch(`${base}/op`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

test("a routine create runs on the worker and syncs the file back to the store", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { status, json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "POST",
      rest: "routines",
      contentType: "application/json",
      body: JSON.stringify({
        name: "Digest",
        prompt: "p",
        schedule: "0 9 * * *",
        enabled: true,
      }),
    }),
  );
  expect(status, JSON.stringify(json)).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.status).toBe(201);
  const created = JSON.parse(json.body as string) as {
    id: string;
    created_by?: string;
  };
  expect(created.created_by).toBe("user-1");
  expect(json.events).toEqual(["RoutinesChanged"]);
  const synced = await store.list(prefix);
  const routinesKey = synced.find((k) =>
    k.endsWith("/.houston/routines/routines.json"),
  );
  expect(routinesKey).toBeDefined();
});

test("a conversation rename runs the runtime's own mutation and syncs only that file", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const convFile = join(
    storeRoot,
    prefix,
    "workspaces",
    ...agentId.split("/"),
    ".houston",
    "runtime",
    "conversations",
    "c1.json",
  );
  mkdirSync(dirname(convFile), { recursive: true });
  writeFileSync(
    convFile,
    JSON.stringify({
      id: "c1",
      title: "old",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    }),
  );
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "conversation",
      action: "rename",
      conversationId: "c1",
      title: "new name",
    }),
  );
  expect(json.status).toBe(200);
  const after = JSON.parse(readFileSync(convFile, "utf8")) as { title: string };
  expect(after.title).toBe("new name");
  expect(prefix).toBe("ws/w1/agent-1");
});

test("an invalid op is rejected before any hydration", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { status, json } = await postOp(
    base,
    opBody(agentId, "http://127.0.0.1:1/hb", {
      kind: "route",
      method: "GET",
      rest: "activities",
    }),
  );
  expect(status).toBe(400);
  expect(String(json.error)).toContain("not a read op route");
});

test("a typed worker-op decline soft-fails to the standing pod", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
      runOp: async () => {
        throw new WorkerOpDeclinedError("standing pod required");
      },
    }),
  );

  const { status, json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "settings",
      action: "put",
      input: { activeProvider: "anthropic" },
    }),
  );

  expect(status).toBe(200);
  expect(json).toMatchObject({ ok: true, decline: true });
});

test("a files list runs as a READ op: no sync-back, runtime tree not hydrated", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "files",
      body: "",
      contentType: "application/json",
    }),
  );
  expect(json.status).toBe(200);
  const listing = JSON.parse(json.body as string) as Array<{ name: string }>;
  const names = listing.map((e) => e.name);
  expect(names).toContain("report.csv");
  expect(JSON.stringify(listing)).not.toContain("c1.json");
});

test("one skill's detail runs as a READ op over the hydrated tree", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const skillDir = join(
    storeRoot,
    prefix,
    "workspaces",
    ...agentId.split("/"),
    ".agents",
    "skills",
    "weekly-digest",
  );
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    "---\nname: weekly-digest\ndescription: Sums up the week\n---\nWrite the digest.\n",
  );
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const read = (rest: string) =>
    postOp(
      base,
      opBody(agentId, "http://127.0.0.1:1/hb", {
        kind: "route",
        method: "GET",
        rest,
        body: "",
        contentType: "application/json",
      }),
    );

  const found = await read("skills/weekly-digest");
  expect(found.json.status).toBe(200);
  expect(JSON.parse(found.json.body as string)).toMatchObject({
    name: "weekly-digest",
    description: "Sums up the week",
  });
  const missing = await read("skills/no-such-skill");
  expect(missing.json.status).toBe(404);
  expect(missing.json.body).toBe(JSON.stringify({ error: "skill not found" }));
});

test("a file download relays binary bytes base64 with its headers", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "files/download",
      query: "path=report.csv",
    }),
  );
  expect(json.status).toBe(200);
  expect(typeof json.bodyBase64).toBe("string");
  expect(json.body).toBe("");
  expect(
    Buffer.from(json.bodyBase64 as string, "base64").toString("utf8"),
  ).toBe("a,b\n1,2\n");
  expect(
    String(
      (json.headers as Record<string, string> | undefined)?.[
        "content-disposition"
      ] ?? "",
    ),
  ).toContain("report.csv");
});

test("a root-level agentfile write persists (F6: no longer dropped)", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "PUT",
      rest: "agentfile/data-schema.md",
      contentType: "application/json",
      body: JSON.stringify({ content: "# schema" }),
    }),
  );
  expect(json.ok).toBe(true);
  expect(json.decline).toBeUndefined();
  const synced = await store.list(prefix);
  expect(synced.some((k) => k.endsWith("/data-schema.md"))).toBe(true);
});

test("mission attribution (actingAs.name) reaches the activity handler", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const body = opBody(agentId, await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "activities",
    contentType: "application/json",
    body: JSON.stringify({ title: "Draft the memo", status: "needs_you" }),
  });
  (body.actingAs as { name?: string }).name = "Alice Lee";
  const { json } = await postOp(base, body);
  expect(json.status).toBe(201);
  const created = JSON.parse(json.body as string) as {
    created_by?: string;
    contributors?: Array<{ user_id: string; name?: string }>;
  };
  expect(created.created_by).toBe("user-1");
  expect(created.contributors).toEqual([
    { user_id: "user-1", name: "Alice Lee" },
  ]);
});

async function createActivityOp(
  via?: unknown,
): Promise<Record<string, unknown>> {
  const { storeRoot } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const body = opBody("agent-1", await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "activities",
    contentType: "application/json",
    body: JSON.stringify({ title: "Draft the memo", status: "needs_you" }),
  });
  if (via !== undefined) (body.actingAs as { via?: unknown }).via = via;
  const { json } = await postOp(base, body);
  expect(json.status, JSON.stringify(json)).toBe(201);
  return JSON.parse(json.body as string) as Record<string, unknown>;
}

test("an asleep agent's card created by the AI Manager (actingAs.via) is started by Houston", async () => {
  const created = await createActivityOp("assistant");
  expect(created.started_by).toBe("houston");
  expect(created.created_by).toBe("user-1");
});

test("an op without actingAs.via stamps no started_by", async () => {
  const created = await createActivityOp();
  expect("started_by" in created).toBe(false);
});

test("an unknown actingAs.via is ignored: the op runs, no started_by", async () => {
  for (const via of ["employee", "", 1, { kind: "assistant" }]) {
    const created = await createActivityOp(via);
    expect("started_by" in created, JSON.stringify(via)).toBe(false);
    expect(created.created_by).toBe("user-1");
  }
});

test("a settings claim runs on the worker and syncs settings.json back (never moves a set provider)", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const hb = await heartbeatOK();

  let { json } = await postOp(
    base,
    opBody(agentId, hb, {
      kind: "settings",
      action: "claim",
      provider: "openai-codex",
      connectedProviders: ["openai-codex"],
    }),
  );
  expect(json, JSON.stringify(json)).toMatchObject({ status: 200 });
  expect(JSON.parse(json.body as string)).toMatchObject({
    activeProvider: "openai-codex",
  });
  const synced = await store.list(prefix);
  expect(
    synced.some((k) => k.endsWith("/.houston/runtime/settings.json")),
  ).toBe(true);
  expect(synced.some((k) => k.endsWith("/runtime/conversations/c1.json"))).toBe(
    true,
  );

  ({ json } = await postOp(
    base,
    opBody(agentId, hb, {
      kind: "settings",
      action: "claim",
      provider: "anthropic",
      connectedProviders: ["openai-codex", "anthropic"],
    }),
  ));
  expect(json, JSON.stringify(json)).toMatchObject({ status: 200 });
  expect(JSON.parse(json.body as string)).toMatchObject({
    activeProvider: "openai-codex",
  });

  ({ json } = await postOp(
    base,
    opBody(agentId, hb, {
      kind: "settings",
      action: "put",
      input: {
        activeProvider: "anthropic",
        model: "claude-sonnet-5",
        effort: "high",
      },
    }),
  ));
  const after = JSON.parse(json.body as string) as {
    activeProvider: string;
    models: Record<string, string>;
    effort: string;
  };
  expect(after.activeProvider).toBe("anthropic");
  expect(after.models.anthropic).toBe("claude-sonnet-5");
  expect(after.effort).toBe("high");
});

test("a settings put merges into the stored settings.json (the op downloads it)", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const settingsKey = `${prefix}/workspaces/${agentId}/.houston/runtime/settings.json`;
  writeFileSync(
    join(storeRoot, ...settingsKey.split("/")),
    JSON.stringify({ models: { openai: "x" }, effort: "high" }),
  );
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "settings",
      action: "put",
      input: { activeProvider: "anthropic" },
    }),
  );
  expect(json, JSON.stringify(json)).toMatchObject({ status: 200 });
  const stored = JSON.parse(
    readFileSync(join(storeRoot, ...settingsKey.split("/")), "utf8"),
  );
  expect(stored).toEqual({
    activeProvider: "anthropic",
    models: { openai: "x" },
    effort: "high",
  });
});

test("an api-key connect that fails connectability pushes nothing and leaves no auth.json", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const pushes: { path: string; auth: string; body: string }[] = [];
  const gateway = await listen(
    createServer((req, res) => {
      if (req.method === "PUT" && req.url?.startsWith("/v1/pod/credentials/")) {
        let body = "";
        req.on("data", (c) => {
          body += c;
        });
        req.on("end", () => {
          pushes.push({
            path: req.url ?? "",
            auth: req.headers.authorization ?? "",
            body,
          });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        });
        return;
      }
      res.writeHead(200);
      res.end("{}");
    }),
  );
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, `${gateway}/hb`, {
      kind: "credential",
      action: "api-key",
      provider: "nope-provider",
      apiKey: "sk-test",
    }),
  );
  expect(json.status).toBe(400);
  expect(pushes).toHaveLength(0);
  expect((await store.list(prefix)).some((k) => k.endsWith("auth.json"))).toBe(
    false,
  );
});

class DownloadLog extends LocalDirStore {
  readonly downloaded: string[] = [];
  override download(
    key: string,
    destFile: string,
    opts?: Parameters<LocalDirStore["download"]>[2],
  ): ReturnType<LocalDirStore["download"]> {
    this.downloaded.push(key);
    return super.download(key, destFile, opts);
  }
}

test("settings and credential ops on a heavy agent download none of its project folders", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const project = join(storeRoot, prefix, "workspaces", agentId, "render");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "big.bin"), Buffer.alloc(3 * 1024 * 1024, 1));
  const store = new DownloadLog(storeRoot);
  const base = await listen(
    createTurnServer({
      store,
      token: "",
      runTurn: noopTurn,
      maxHydrateBytes: 1024 * 1024,
    }),
  );
  const hb = await heartbeatOK();

  let { json } = await postOp(
    base,
    opBody(agentId, hb, {
      kind: "settings",
      action: "put",
      input: { activeProvider: "anthropic", model: "claude-sonnet-5" },
    }),
  );
  expect(json, JSON.stringify(json)).toMatchObject({ status: 200 });
  expect(JSON.parse(json.body as string)).toMatchObject({
    activeProvider: "anthropic",
  });

  ({ json } = await postOp(
    base,
    opBody(agentId, hb, {
      kind: "credential",
      action: "api-key",
      provider: "nope-provider",
      apiKey: "sk-test",
    }),
  ));
  expect(json, JSON.stringify(json)).toMatchObject({ status: 400 });

  expect(store.downloaded.some((k) => k.endsWith("/render/big.bin"))).toBe(
    false,
  );
  const synced = await store.list(prefix);
  expect(synced.some((k) => k.endsWith("/render/big.bin"))).toBe(true);
  expect(
    synced.some((k) => k.endsWith("/.houston/runtime/settings.json")),
  ).toBe(true);
});
