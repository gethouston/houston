import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { dispatchAgentOp } from "@houston/host/src/op/dispatch";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
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

class WriteLog extends LocalDirStore {
  readonly writes: string[] = [];
  override upload(
    srcFile: string,
    key: string,
    opts?: Parameters<LocalDirStore["upload"]>[2],
  ) {
    this.writes.push(`upload ${key}`);
    return super.upload(srcFile, key, opts);
  }
  override delete(key: string, opts?: Parameters<LocalDirStore["delete"]>[1]) {
    this.writes.push(`delete ${key}`);
    return super.delete(key, opts);
  }
}

async function seedAgent() {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-list-reads-"));
  const prefix = "ws/w1/agent-1";
  const workspacesRoot = join(storeRoot, prefix, "workspaces");
  const store = new LocalWorkspaceStore(workspacesRoot);
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Bob" });
  const agentDir = join(workspacesRoot, ...agent.id.split("/"));
  const put = (rel: string, value: string) => {
    const path = join(agentDir, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  put("CLAUDE.md", "# Bob\n");
  put(
    ".houston/routines/routines.json",
    JSON.stringify([
      { id: "r1", name: "Digest", prompt: "p", schedule: "0 9 * * *" },
      { id: "r2", name: "Neither wake", prompt: "p" },
    ]),
  );
  put(
    ".houston/routine_runs/routine_runs.json",
    JSON.stringify([
      { id: "run-1", routine_id: "r1", status: "success" },
      { id: "run-2" },
    ]),
  );
  put(
    ".houston/learnings/learnings.json",
    JSON.stringify([{ id: "l1", text: "Prefers short replies" }, "stray"]),
  );
  put(".houston/config/config.json", JSON.stringify(["not", "an", "object"]));
  put(
    ".agents/skills/weekly-digest/SKILL.md",
    "---\nname: weekly-digest\ndescription: Sums up the week\n---\nWrite the digest.\n",
  );
  put(".agents/skills/loose-notes/SKILL.md", "No frontmatter here.\n");
  return { storeRoot, prefix, workspacesRoot, agentId: agent.id };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

function opBody(heartbeatUrl: string, rest: string) {
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
    op: {
      kind: "route",
      method: "GET",
      rest,
      body: "",
      contentType: "application/json",
    },
  };
}

async function postOp(base: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (json.error !== "worker_full" || attempt > 40)
      return { status: response.status, json };
    await new Promise((r) => setTimeout(r, 25));
  }
}

const DIAGNOSTIC: Record<string, string> = {
  routines: "dropped routine without exactly one of schedule/trigger",
  routine_runs: "dropped malformed routine run",
  learnings: "dropped malformed learning",
  config: "config.json is not an object",
  skills: "SKILL.md for 'loose-notes' has no YAML frontmatter",
};

test("each family list runs as a read op with the host handler's answer, syncing and announcing nothing", async () => {
  const { storeRoot, prefix, workspacesRoot, agentId } = await seedAgent();
  const store = new WriteLog(storeRoot);
  const before = await store.list(prefix);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const hb = await heartbeatOK();

  for (const [rest, diagnostic] of Object.entries(DIAGNOSTIC)) {
    const host = await dispatchAgentOp({
      workspacesRoot,
      agentId,
      request: { method: "GET", rest, triggersEnabled: false },
    });
    const { status, json } = await postOp(base, opBody(hb, rest));

    expect(status, rest).toBe(200);
    expect(json.ok, rest).toBe(true);
    expect(json.decline, rest).toBeUndefined();
    expect(json.status, rest).toBe(200);
    expect(json.status, rest).toBe(host.status);
    expect(json.contentType, rest).toBe(host.contentType);
    expect(json.body, rest).toBe(host.body);
    expect(json.body as string, rest).toContain(diagnostic);
    expect(json.events, rest).toEqual([]);
    expect(host.events, rest).toEqual([]);
  }

  const skills = (await postOp(base, opBody(hb, "skills"))).json;
  expect(JSON.parse(skills.body as string)).toMatchObject({
    items: [{ name: "weekly-digest", description: "Sums up the week" }],
  });
  const routines = (await postOp(base, opBody(hb, "routines"))).json;
  expect(JSON.parse(routines.body as string)).toMatchObject({
    items: [{ id: "r1", name: "Digest" }],
  });

  expect(store.writes).toEqual([]);
  expect(await store.list(prefix)).toEqual(before);
});
