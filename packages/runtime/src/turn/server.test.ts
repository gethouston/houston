import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore, type ObjectStore } from "./object-store";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

/**
 * The per-turn server contract, end to end against a real (local) object
 * store: hydrate → run → stream frames → sync back → terminal frame. The pi
 * session itself is injected (a real turn needs an LLM); what's under test is
 * the orchestration every turn depends on — including that `done` is only
 * sent AFTER the workspace is durable, and that the per-turn credential is
 * written locally but never persisted.
 */

const storeRoot = mkdtempSync(join(tmpdir(), "houston-turnstore-"));
const store = new LocalDirStore(storeRoot);
const PREFIX = "ws/w1/agent-1";

function seed(rel: string, content: string) {
  const abs = join(storeRoot, ...PREFIX.split("/"), ...rel.split("/"));
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, content);
}

// A fake pi turn: proves it sees the hydrated workspace + injected credential,
// mutates the workspace, emits frames.
const fakeTurn: typeof runPiTurn = async (
  root,
  _conversationId,
  text,
  provider,
  emit,
) => {
  const notes = await readFile(join(root, "workspace", "notes.txt"), "utf8");
  const auth = await readFile(join(root, "data", "auth.json"), "utf8");
  await writeFile(join(root, "workspace", "deck.pptx"), "DECK-BYTES");
  emit({ type: "user", data: { content: text, ts: 1 } });
  emit({
    type: "text",
    data: `saw:${notes};provider:${provider};auth:${JSON.parse(auth)[provider].access}`,
  });
  return {};
};

let server: Server;
let base = "";

beforeAll(async () => {
  server = createTurnServer({ store, token: "turn-secret", runTurn: fakeTurn });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

afterAll(() => server.close());

const CRED = {
  provider: "openai-codex",
  access: "AT-turn",
  expires: 1750000000000,
  accountId: "acc",
};
const turnBody = (over: Record<string, unknown> = {}) => ({
  workspaceId: "w1",
  agentId: "agent-1",
  conversationId: "c1",
  text: "build me a deck",
  gcsPrefix: PREFIX,
  credential: CRED,
  ...over,
});

const post = (body: unknown, token = "turn-secret") =>
  fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify(body),
  });

test("rejects a missing/wrong app token (401) and a bad body (400)", async () => {
  expect((await post(turnBody(), "wrong")).status).toBe(401);
  const bad = await post({ workspaceId: "w1" });
  expect(bad.status).toBe(400);
  expect(((await bad.json()) as { error: string }).error).toContain("agentId");
});

test("a full turn: hydrates, injects the credential, streams frames, syncs back", async () => {
  seed("workspace/notes.txt", "hello-from-gcs");
  const res = await post(turnBody());
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const raw = await res.text();

  // Frames arrive in order and carry proof the fake turn saw hydrated state +
  // the injected access token (and only the access token — applyServedCredential).
  expect(raw).toContain('"type":"user"');
  expect(raw).toContain("saw:hello-from-gcs");
  expect(raw).toContain("provider:openai-codex");
  expect(raw).toContain("auth:AT-turn");
  expect(raw.indexOf('"type":"text"')).toBeLessThan(
    raw.indexOf('"type":"done"'),
  );

  // The mutation is durable in the store; the credential is NOT.
  const keys = await store.list(PREFIX);
  expect(keys).toContain(`${PREFIX}/workspace/deck.pptx`);
  expect(keys.find((k) => k.endsWith("auth.json"))).toBeUndefined();
});

test("no credential → error frame with a clear message, never a hang", async () => {
  const res = await post(turnBody({ credential: null }));
  const raw = await res.text();
  expect(raw).toContain("No provider connected");
  expect(raw).toContain('"type":"error"');
  expect(raw).not.toContain('"type":"done"');
});

test("a sync failure surfaces as the turn's error — never a quiet done", async () => {
  // Fresh prefix: the fake turn's deck.pptx is genuinely NEW here, so syncBack
  // must attempt the (broken) upload. Reusing the happy-path prefix would let
  // the content differ correctly skip the identical bytes and mask the test.
  const PREFIX2 = "ws/w2/agent-2";
  const abs = join(storeRoot, ...PREFIX2.split("/"), "workspace", "notes.txt");
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "hello-from-gcs");
  const broken: ObjectStore = {
    list: (p) => store.list(p),
    download: (k, d) => store.download(k, d),
    upload: async () => {
      throw new Error("disk on fire");
    },
    delete: (k) => store.delete(k),
  };
  const s2 = createTurnServer({ store: broken, token: "", runTurn: fakeTurn });
  await new Promise<void>((r) => s2.listen(0, "127.0.0.1", () => r()));
  const addr = s2.address();
  const b2 = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const res = await fetch(`${b2}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        turnBody({ workspaceId: "w2", agentId: "agent-2", gcsPrefix: PREFIX2 }),
      ),
    });
    const raw = await res.text();
    expect(raw).toContain("sync failed");
    expect(raw).toContain("disk on fire");
    expect(raw).not.toContain('"type":"done"');
  } finally {
    s2.close();
  }
});

test("a routine's model/effort pin reaches the pi turn", async () => {
  // Capture the pin the server forwards to runPiTurn (8th arg).
  let seen: { model?: string | null; effort?: string | null } | undefined;
  const capture: typeof runPiTurn = async (
    _root,
    _cid,
    text,
    _provider,
    emit,
    _signal,
    _nonce,
    pin,
  ) => {
    seen = pin;
    emit({ type: "user", data: { content: text, ts: 1 } });
    return {};
  };
  const s = createTurnServer({ store, token: "", runTurn: capture });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const addr = s.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    await fetch(`${b}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        turnBody({ model: "claude-opus-4-8", effort: "high" }),
      ),
    });
    expect(seen).toEqual({ model: "claude-opus-4-8", effort: "high" });
  } finally {
    s.close();
  }
});

test("health endpoint reports turn mode", async () => {
  const r = await fetch(`${base}/health`);
  expect(((await r.json()) as { mode: string }).mode).toBe("turn");
});
