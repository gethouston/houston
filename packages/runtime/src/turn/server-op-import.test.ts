import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { zipSync } from "fflate";
import { afterEach, expect, test, vi } from "vitest";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/acme/bob";
const AGENT = "workspaces/Personal/Bob";
const RUNTIME = `${AGENT}/.houston/runtime`;

function transcript(id: string, title = "Hello") {
  return {
    id,
    title,
    createdAt: 1,
    updatedAt: 2,
    messages: [
      { role: "user", content: "hi", ts: 1 },
      { role: "assistant", content: "hello!", ts: 2 },
    ],
  };
}

const zipOf = (entries: Record<string, unknown>) =>
  Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([name, value]) => [
          name,
          new TextEncoder().encode(
            typeof value === "string" ? value : JSON.stringify(value),
          ),
        ]),
      ),
    ),
  ).toString("base64");

async function worker(transcriptStatus = 200) {
  const pool = fakePoolStore(PREFIX, transcriptStatus);
  pool.put(`${AGENT}/CLAUDE.md`, "# Bob\n");
  pool.put(`${RUNTIME}/settings.json`, '{"activeProvider":"anthropic"}');
  const server = createTurnServer({
    store: new LocalDirStore(pool.root),
    token: "",
    runTurn: noopTurn,
    poolStoreUrl: POOL_STORE_URL,
    fetchImpl: pool.fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (op: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${base}/op`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "acme",
          agentId: "bob",
          gcsPrefix: PREFIX,
          hostToken: "host-token",
          claim: {
            id: "claim-1",
            bootId: "boot-1",
            token: "claim-token",
            heartbeatUrl: HEARTBEAT_URL,
          },
          triggersEnabled: false,
          op: { kind: "route", ...op },
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (json.error !== "worker_full" || attempt > 40) return json;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const importChunk = (entries: Record<string, unknown>, query?: string) =>
    post({
      method: "POST",
      rest: "migration/import",
      contentType: "application/zip",
      bodyBase64: zipOf(entries),
      ...(query ? { query } : {}),
    });
  return { pool, post, importChunk };
}

const sessionKeys = (keys: string[], cid: string) =>
  keys.filter((k) => k.startsWith(`${RUNTIME}/sessions/${cid}/`));

test("a transcript chunk imports on the worker under the agent-import claim, sessions synthesized", async () => {
  const { pool, importChunk } = await worker();
  const json = await importChunk({
    ".houston/runtime/conversations/c9.json": transcript("c9"),
    "notes.md": "hello\n",
  });
  expect(json.decline, JSON.stringify(json)).toBeUndefined();
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(JSON.parse(json.body as string)).toMatchObject({
    written: 2,
    sessionsRebuilt: true,
  });
  expect(json.events).toContain("ConversationsChanged");
  const keys = await pool.keys();
  expect(keys).toContain(`${RUNTIME}/conversations/c9.json`);
  expect(keys).toContain(`${AGENT}/notes.md`);
  expect(sessionKeys(keys, "c9").length).toBeGreaterThan(0);
  expect(pool.writes.length).toBeGreaterThan(0);
  for (const write of pool.writes) {
    expect(write.claim, write.key).toBe("agent-import");
    expect(write.ifGenerationMatch, write.key).toBe("0");
  }
  expect(pool.read(`${RUNTIME}/settings.json`)).toContain("anthropic");
});

test("each imported conversation is repaired whole into the transcript store", async () => {
  const { pool, importChunk } = await worker();
  await importChunk({
    ".houston/runtime/conversations/c9.json": transcript("c9", "Ninth"),
  });
  const repairs = pool.transcripts.filter((t) => t.path.endsWith("/repair"));
  expect(repairs.map((r) => [r.method, r.path])).toEqual([
    ["POST", "/v1/pod/transcripts/acme/bob/conversations/c9/repair"],
  ]);
  const [repair] = repairs;
  expect(repair?.headers.get("Authorization")).toBe("Bearer host-token");
  expect(repair?.headers.get("X-Houston-Claim-Token")).toBe("claim-token");
  expect(repair?.headers.get("X-Houston-Claim-Boot")).toBe("boot-1");
  expect(repair?.headers.get("X-Houston-Claim-Conversation")).toBe(
    "agent-import",
  );
  expect(repair?.headers.get("Content-Type")).toBe("application/json");
  expect(JSON.parse(repair?.body ?? "{}")).toEqual(transcript("c9", "Ninth"));
});

test("skip-existing sees a conversation and a session that exist only in the store", async () => {
  const { pool, importChunk } = await worker();
  pool.put(
    `${RUNTIME}/conversations/old.json`,
    JSON.stringify(transcript("old", "Kept")),
  );
  pool.put(`${RUNTIME}/sessions/c7/s.jsonl`, "{}\n");
  const json = await importChunk({
    ".houston/runtime/conversations/old.json": transcript("old", "Replaced"),
    ".houston/runtime/conversations/c7.json": transcript("c7"),
  });
  expect(JSON.parse(json.body as string)).toMatchObject({
    written: 1,
    skipped: 1,
  });
  expect(pool.read(`${RUNTIME}/conversations/old.json`)).toContain("Kept");
  expect(sessionKeys(await pool.keys(), "c7")).toEqual([
    `${RUNTIME}/sessions/c7/s.jsonl`,
  ]);
  const repaired = pool.transcripts.map((t) => t.path).sort();
  expect(repaired).toEqual([
    "/v1/pod/transcripts/acme/bob/conversations/c7/repair",
    "/v1/pod/transcripts/acme/bob/conversations/old/repair",
  ]);
  const old = pool.transcripts.find((t) => t.path.endsWith("/old/repair"));
  expect(JSON.parse(old?.body ?? "{}").title).toBe("Kept");
});

test("sessions=0 imports the transcript and synthesizes no session", async () => {
  const { pool, importChunk } = await worker();
  const json = await importChunk(
    { ".houston/runtime/conversations/c9.json": transcript("c9") },
    "sessions=0",
  );
  expect(JSON.parse(json.body as string)).toMatchObject({
    written: 1,
    sessionsRebuilt: false,
  });
  const keys = await pool.keys();
  expect(keys).toContain(`${RUNTIME}/conversations/c9.json`);
  expect(sessionKeys(keys, "c9")).toEqual([]);
});

test("a rejected repair is logged loudly and the import still answers 200", async () => {
  const { pool, importChunk } = await worker(500);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const json = await importChunk({
      ".houston/runtime/conversations/c9.json": transcript("c9"),
    });
    expect(json.status).toBe(200);
    expect(json.ambiguous).toBeUndefined();
    expect(await pool.keys()).toContain(`${RUNTIME}/conversations/c9.json`);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("transcript repair c9 rejected (500)"),
    );
  } finally {
    error.mockRestore();
  }
});

test("other route ops keep the agent-ops claim and never sync the runtime tree", async () => {
  const { pool, post } = await worker();
  const json = await post({
    method: "POST",
    rest: "routines",
    contentType: "application/json",
    body: JSON.stringify({
      name: "Daily",
      prompt: "check",
      schedule: "0 9 * * *",
    }),
  });
  expect(json.status, JSON.stringify(json)).toBe(201);
  expect(pool.writes.length).toBeGreaterThan(0);
  for (const write of pool.writes) {
    expect(write.claim, write.key).toBe("agent-ops");
    expect(write.key.startsWith(`${RUNTIME}/`), write.key).toBe(false);
  }
  expect(pool.transcripts).toEqual([]);
});
