import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];
afterEach(() =>
  servers.splice(0).forEach((server) => {
    server.close();
  }),
);

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

function frames(raw: string) {
  return raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as {
          type: string;
          data: Record<string, unknown> | null;
        },
    );
}

const request = (extra: Record<string, unknown> = {}) => ({
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

async function post(base: string, body: Record<string, unknown>) {
  const response = await fetch(`${base}/turn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return frames(await response.text());
}

async function seed(root: string, rel: string, content: string) {
  const path = join(root, ...rel.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

const claimed = {
  hostToken: "host-token",
  claim: {
    id: "claim-1",
    bootId: "boot-1",
    token: "claim-token",
    heartbeatUrl: "https://gateway.test/v1/pool/claims/heartbeat",
  },
};

test.each([
  {
    name: "standing",
    dataRel: "workspaces/W/A/.houston/runtime",
    workspaceRel: "workspaces/W/A",
  },
  { name: "cloudrun", dataRel: "data", workspaceRel: "workspace" },
])("a claimed turn syncs only its conversation and session on $name layout", async ({
  dataRel,
  workspaceRel,
}) => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-store-"));
  const prefixRoot = join(storeRoot, "ws", "w1", "agent-1");
  await seed(prefixRoot, `${dataRel}/settings.json`, "{}");
  await seed(prefixRoot, `${dataRel}/conversations/c1.json`, '{"before":1}');
  const runTurn: typeof runPiTurn = async (layout) => {
    await seed(layout.dataDir, "conversations/c1.json", '{"after":1}');
    await seed(layout.dataDir, "sessions/c1/state.json", "session");
    await seed(
      layout.workspaceDir,
      ".houston/activity/activity.json",
      '[{"id":"a1","title":"Plan","status":"running"}]',
    );
    await seed(
      layout.workspaceDir,
      ".houston/activity/activity.schema.json",
      '{"type":"array"}',
    );
    await seed(layout.workspaceDir, "result.txt", "workspace");
    await seed(layout.workspaceDir, ".houston/routines/routines.json", "[]");
    return {};
  };
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn,
      fetchImpl: async () => new Response(null, { status: 204 }),
    }),
  );

  const emitted = await post(base, request(claimed));
  const keys = await new LocalDirStore(storeRoot).list("ws/w1/agent-1");

  expect(
    await readFile(join(prefixRoot, dataRel, "conversations/c1.json"), "utf8"),
  ).toBe('{"after":1}');
  expect(
    await readFile(join(prefixRoot, dataRel, "sessions/c1/state.json"), "utf8"),
  ).toBe("session");
  expect(
    await readFile(
      join(prefixRoot, workspaceRel, ".houston/activity/activity.json"),
      "utf8",
    ),
  ).toBe('[{"id":"a1","title":"Plan","status":"running"}]');
  expect(keys).not.toContain(`ws/w1/agent-1/${workspaceRel}/result.txt`);
  expect(keys).not.toContain(
    `ws/w1/agent-1/${workspaceRel}/.houston/activity/activity.schema.json`,
  );
  expect(keys).not.toContain(
    `ws/w1/agent-1/${workspaceRel}/.houston/routines/routines.json`,
  );
  expect(emitted.at(-1)).toMatchObject({
    type: "done",
    data: { poolWritesOutOfScope: 3 },
  });
  expect(log).toHaveBeenCalledWith(
    "[turn] pool_writes_out_of_scope=3 prefix=ws/w1/agent-1 conversation=c1",
  );
  log.mockRestore();
});

test("an unclaimed turn retains full sync-back", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-store-"));
  const prefixRoot = join(storeRoot, "ws", "w1", "agent-1");
  await seed(prefixRoot, "data/settings.json", "{}");
  const runTurn: typeof runPiTurn = async (layout) => {
    await seed(layout.workspaceDir, "result.txt", "workspace");
    await seed(layout.dataDir, "sessions/c1/state.json", "session");
    return {};
  };
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn,
    }),
  );

  const emitted = await post(base, request());
  expect(await readFile(join(prefixRoot, "workspace/result.txt"), "utf8")).toBe(
    "workspace",
  );
  expect(emitted.at(-1)).toEqual(
    expect.objectContaining({ type: "done", data: null }),
  );
});

test("shadow resolves a standing layout and reports hydrated objects", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-store-"));
  const prefixRoot = join(storeRoot, "ws", "w1", "agent-1");
  await seed(prefixRoot, "workspaces/W/A/.houston/runtime/settings.json", "{}");
  const runTurn = vi.fn<typeof runPiTurn>();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn,
    }),
  );

  const emitted = await post(base, request({ shadow: true }));
  expect(emitted.map(({ type }) => type)).toEqual(["shadow", "done"]);
  expect(emitted[0]?.data).toMatchObject({ hydratedObjects: 1 });
  expect(runTurn).not.toHaveBeenCalled();
});

test("a claimed turn on an EMPTY prefix is layout_unexpected, never a seeded cloudrun tree", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-store-"));
  const runTurn = vi.fn<typeof runPiTurn>();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn,
      fetchImpl: async () => new Response(null, { status: 204 }),
    }),
  );
  const emitted = await post(base, request(claimed));
  expect(emitted.at(-1)).toMatchObject({
    type: "error",
    data: { code: "layout_unexpected" },
  });
  expect(runTurn).not.toHaveBeenCalled();
  // Nothing was written back: a blank hydrate must not seed `data/` beside a
  // standing agent's real tree.
  expect(await new LocalDirStore(storeRoot).list("ws/w1/agent-1")).toEqual([]);
});

test("an unclaimed turn on an EMPTY prefix still starts as a fresh cloudrun agent", async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-store-"));
  const runTurn = vi.fn<typeof runPiTurn>(async () => ({}));
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn,
    }),
  );
  const emitted = await post(base, request());
  expect(emitted.at(-1)?.type).toBe("done");
  expect(runTurn).toHaveBeenCalledOnce();
});
