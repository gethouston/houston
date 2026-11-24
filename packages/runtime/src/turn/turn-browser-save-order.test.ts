import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import { sharedBrowserPool } from "../session/tools/browser/pool";
import { browserStatePath } from "../session/tools/browser/state-store";
import { executeReadyTurn } from "./execute-ready-turn";
import type { TurnServerDeps } from "./server-types";
import { cleanupTurn } from "./turn-cleanup";
import * as durability from "./turn-durability";
import { prepareTurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

const PREFIX = "ws/w1/agent-1";
const STATE_KEY = `${PREFIX}/workspaces/W/A/.houston/browser/state.json`;
const SIGNED_IN = JSON.stringify({
  cookies: [{ name: "sid", value: "kept" }],
  origins: [],
});

afterEach(() => vi.restoreAllMocks());

async function pooledTurn() {
  const storeRoot = await mkdtemp(join(tmpdir(), "browser-save-store-"));
  const claude = join(storeRoot, PREFIX, "workspaces/W/A/CLAUDE.md");
  await mkdir(dirname(claude), { recursive: true });
  await writeFile(claude, "# A\n");
  const store = new LocalDirStore(storeRoot);
  const root = await mkdtemp(join(tmpdir(), "browser-save-root-"));
  const filesystem = await prepareTurnFilesystem({
    store,
    prefix: PREFIX,
    root,
    claimed: true,
  });
  const order: string[] = [];
  vi.spyOn(sharedHandoffs, "end").mockImplementation((conversationId) => {
    order.push(`end hand-off ${conversationId}`);
  });
  vi.spyOn(sharedBrowserPool, "saveUnder").mockImplementation(async (dir) => {
    order.push(`save ${dir === root ? "root" : dir}`);
    const path = browserStatePath(filesystem.workspaceDir);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, SIGNED_IN, { mode: 0o600 });
  });
  const finish = durability.finishTurnDurability;
  vi.spyOn(durability, "finishTurnDurability").mockImplementation((opts) => {
    order.push("durability");
    return finish(opts);
  });
  const deps = {
    store,
    token: "",
    poolStoreUrl: "https://store.example",
    fetchImpl: (async (_url: unknown, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response("{}", { status: 200 })
        : Response.json({ doc: [], revision: 1 })) as typeof fetch,
    activityDocRetryDelaysMs: [],
    runTurn: async () => {
      order.push("turn");
      return {};
    },
  } as TurnServerDeps;
  const frames: WireFrame[] = [];
  await executeReadyTurn({
    deps,
    turn: {
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "chat-1",
      text: "Sign in to the bank",
      gcsPrefix: PREFIX,
      shadow: false,
      credential: { provider: "openai-codex", access: "a", expires: 1 },
      claim: { id: "c", token: "t", bootId: "b", heartbeatUrl: "https://x" },
      hostToken: "host-token",
    } as unknown as TurnRequest,
    turnId: "turn-1",
    root,
    scope: "turn-1",
    authPath: join(root, "auth.json"),
    signal: new AbortController().signal,
    filesystem,
    resolved: { store, prefix: PREFIX },
    heartbeat: null,
    sandbox: null,
    timings: {},
    emit: (frame) => frames.push(frame),
    turnLog: null,
    transcript: null,
  });
  return { storeRoot, root, order, frames };
}

test("the turn's sign-ins are saved before its last sync, so they reach the store", async () => {
  const { storeRoot, root, order, frames } = await pooledTurn();
  try {
    expect(order).toEqual([
      "turn",
      "end hand-off chat-1",
      "save root",
      "durability",
    ]);
    expect(frames.at(-1)?.type).toBe("done");
    expect(
      await readFile(join(storeRoot, ...STATE_KEY.split("/")), "utf8"),
    ).toBe(SIGNED_IN);
  } finally {
    await rm(storeRoot, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("cleanup after the sync closes the turn's browser without saving again", async () => {
  const saveUnder = vi.spyOn(sharedBrowserPool, "saveUnder");
  const closeUnder = vi
    .spyOn(sharedBrowserPool, "closeUnder")
    .mockResolvedValue(undefined);
  await cleanupTurn({
    root: "/tmp/turn-y",
    scope: "w/a",
    conversationId: "c2",
    heartbeat: null,
    sandbox: null,
    removeRoot: async () => undefined,
  });
  expect(closeUnder).toHaveBeenCalledWith("/tmp/turn-y");
  expect(saveUnder).not.toHaveBeenCalled();
});
