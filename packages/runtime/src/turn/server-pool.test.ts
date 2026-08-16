import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { currentActingContext } from "../session/acting-context";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];
afterEach(() =>
  servers.splice(0).forEach((server) => {
    server.close();
  }),
);

const body = (extra: Record<string, unknown> = {}) => ({
  workspaceId: "w1",
  agentId: "agent-1",
  conversationId: "c1",
  text: "hello",
  gcsPrefix: "ws/w1/agent-1",
  credential: {
    provider: "openai-codex",
    access: "access-token",
    expires: Date.now() + 60_000,
  },
  ...extra,
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

const post = (base: string, value = body()) =>
  fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });

function snapshotTree(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relative = path.slice(root.length + 1);
      if (statSync(path).isDirectory()) {
        snapshot[`${relative}/`] = "directory";
        visit(path);
      } else {
        snapshot[relative] = readFileSync(path).toString("base64");
      }
    }
  };
  visit(root);
  return snapshot;
}

test("capacity rejects a concurrent turn and frees the slot after terminal", async () => {
  let release: (() => void) | undefined;
  let markStarted: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const store = new LocalDirStore(mkdtempSync(join(tmpdir(), "pool-store-")));
  const runTurn: typeof runPiTurn = async () => {
    markStarted?.();
    await gate;
    return {};
  };
  const base = await listen(
    createTurnServer({ store, token: "", runTurn, concurrency: 1 }),
  );
  const first = post(base);
  await started;
  const full = await post(base, body({ conversationId: "c2" }));
  expect(full.status).toBe(503);
  expect(full.headers.get("retry-after")).toBe("1");
  expect(await full.json()).toEqual({ error: "worker_full" });
  release?.();
  expect((await first).status).toBe(200);
  await (await first).text();
  expect((await post(base, body({ conversationId: "c3" }))).status).toBe(200);
});

test("a thrown turn never wedges admission", async () => {
  let calls = 0;
  const store = new LocalDirStore(mkdtempSync(join(tmpdir(), "pool-store-")));
  const runTurn: typeof runPiTurn = async () => {
    calls += 1;
    if (calls === 1) throw new Error("boom");
    return {};
  };
  const base = await listen(
    createTurnServer({ store, token: "", runTurn, concurrency: 1 }),
  );
  const failed = await post(base);
  expect(failed.status).toBe(200);
  await failed.text();
  const next = await post(base, body({ conversationId: "c2" }));
  expect(next.status).toBe(200);
  await next.text();
});

test("shadow hydrates and resolves, emits shadow then done, and leaves no writes or root", async () => {
  const root = mkdtempSync(join(tmpdir(), "pool-shadow-store-"));
  const stored = join(root, "ws", "w1", "agent-1", "workspace", "note.txt");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(join(stored, ".."), { recursive: true }),
  );
  await writeFile(stored, "original");
  const storeBefore = snapshotTree(root);
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(root),
      token: "",
      runTurn: async () => {
        throw new Error("provider path must not run");
      },
    }),
  );
  const responsePromise = post(
    base,
    body({ shadow: true, turnId: "shadow-1" }),
  );
  let turnRoot: string | undefined;
  for (let attempt = 0; attempt < 100 && !turnRoot; attempt += 1) {
    turnRoot = readdirSync(tmpdir())
      .filter((name) => name.startsWith("houston-turn-"))
      .map((name) => join(tmpdir(), name))
      .find((candidate) => {
        try {
          return (
            readFileSync(join(candidate, "workspace/note.txt"), "utf8") ===
            "original"
          );
        } catch {
          return false;
        }
      });
    if (!turnRoot) await new Promise((resolve) => setTimeout(resolve, 1));
  }
  const response = await responsePromise;
  const raw = await response.text();
  const frames = raw
    .split("\n\n")
    .flatMap((block) => block.split("\n"))
    .filter((line) => line.startsWith("data: "))
    .map(
      (line) => JSON.parse(line.slice(6)) as { type: string; data: unknown },
    );

  expect(frames.map((frame) => frame.type)).toEqual(["shadow", "done"]);
  expect(frames[0]?.data).toMatchObject({ hydratedObjects: 1 });
  expect(snapshotTree(root)).toEqual(storeBefore);
  expect(turnRoot).toBeDefined();
  expect(existsSync(turnRoot ?? "")).toBe(false);
});

test("a fenced heartbeat skips syncBack and emits claim_fenced", async () => {
  const heartbeat = createServer((_req, res) => {
    res.writeHead(409);
    res.end("adopted");
  });
  const heartbeatBase = await listen(heartbeat);
  const store = new LocalDirStore(mkdtempSync(join(tmpdir(), "pool-store-")));
  const runTurn: typeof runPiTurn = async (root) => {
    await writeFile(join(root, "workspace", "must-not-sync.txt"), "nope");
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {};
  };
  const base = await listen(createTurnServer({ store, token: "", runTurn }));
  const response = await post(
    base,
    body({
      hostToken: "host-token",
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-token",
        heartbeatUrl: heartbeatBase,
      },
    }),
  );
  const raw = await response.text();
  expect(raw).toContain("claim_fenced");
  expect(raw).not.toContain('"type":"done"');
  expect(await store.list("ws/w1/agent-1")).not.toContain(
    "ws/w1/agent-1/workspace/must-not-sync.txt",
  );
});

test("the supplied turn id and acting identity reach the turn session", async () => {
  let seen: unknown;
  const store = new LocalDirStore(mkdtempSync(join(tmpdir(), "pool-store-")));
  const runTurn: typeof runPiTurn = async (_root, turn) => {
    seen = {
      turnId: turn.turnId,
      author: turn.author,
      actingUser: currentActingContext()?.actingUser,
    };
    turn.emit({ type: "text", data: "ok", turnId: turn.turnId });
    return {};
  };
  const base = await listen(createTurnServer({ store, token: "", runTurn }));
  const response = await post(
    base,
    body({
      turnId: "gateway-turn-1",
      actingAs: { userId: "user-1", name: "Ada" },
    }),
  );
  const raw = await response.text();

  expect(seen).toEqual({
    turnId: "gateway-turn-1",
    author: { userId: "user-1", name: "Ada" },
    actingUser: "user-1",
  });
  expect(raw).toContain('"turnId":"gateway-turn-1"');
});
