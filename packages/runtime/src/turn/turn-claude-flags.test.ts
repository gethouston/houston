import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test, vi } from "vitest";
import { CLAUDE_GLOBAL_CONFIG } from "../backends/claude/flag-cache";
import { CLAUDE_FLAGS_DIR, claudeFlagsFileName } from "./claude-flags-path";
import { turnClaudeLayout } from "./turn-backend";
import {
  persistTurnClaudeFlags,
  seedTurnClaudeFlags,
} from "./turn-claude-flags";

const dataRel = "workspaces/Personal/Bob/.houston/runtime";
const aliceFlags = { cachedGrowthBookFeatures: { tengu_a: true } };
const bobFlags = { cachedGrowthBookFeatures: { tengu_a: false } };

afterEach(() => vi.restoreAllMocks());

function turnRoot(stored: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "turn-claude-flags-"));
  const dataDir = join(root, "store", ...dataRel.split("/"));
  mkdirSync(join(dataDir, CLAUDE_FLAGS_DIR), { recursive: true });
  for (const [userId, cache] of Object.entries(stored)) {
    const path = join(dataDir, CLAUDE_FLAGS_DIR, claudeFlagsFileName(userId));
    writeFileSync(
      path,
      typeof cache === "string" ? cache : JSON.stringify(cache),
    );
  }
  const configDir = turnClaudeLayout(root, dataDir, "c1").configDir;
  return { root, dataDir, configDir };
}

const readConfig = (configDir: string) =>
  JSON.parse(readFileSync(join(configDir, CLAUDE_GLOBAL_CONFIG), "utf8"));

function fakeStore(fail?: Error) {
  const uploads: { key: string; body: unknown }[] = [];
  const store = {
    upload: async (src: string, key: string) => {
      if (fail) throw fail;
      uploads.push({ key, body: JSON.parse(readFileSync(src, "utf8")) });
    },
  } as unknown as ObjectStore;
  return { store, uploads };
}

test("seeds the acting member's own cache, never another member's", () => {
  const turn = turnRoot({ "user-alice": aliceFlags, "user-bob": bobFlags });
  seedTurnClaudeFlags({ ...turn, userId: "user-alice" });
  expect(readConfig(turn.configDir)).toEqual(aliceFlags);

  const bobOnly = turnRoot({ "user-bob": bobFlags });
  seedTurnClaudeFlags({ ...bobOnly, userId: "user-alice" });
  expect(existsSync(join(bobOnly.configDir, CLAUDE_GLOBAL_CONFIG))).toBe(false);

  const anonymous = turnRoot({ "user-bob": bobFlags });
  seedTurnClaudeFlags({ ...anonymous, userId: undefined });
  expect(existsSync(join(anonymous.configDir, CLAUDE_GLOBAL_CONFIG))).toBe(
    false,
  );
});

test("a corrupt stored cache is ignored with a warning", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const turn = turnRoot({ "user-alice": "{truncated" });
  seedTurnClaudeFlags({ ...turn, userId: "user-alice" });
  expect(existsSync(join(turn.configDir, CLAUDE_GLOBAL_CONFIG))).toBe(false);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("ignoring the stored flag cache"),
  );
});

test("stores the refreshed cache under the acting member's name", async () => {
  const turn = turnRoot({ "user-alice": aliceFlags });
  mkdirSync(turn.configDir, { recursive: true });
  const refreshed = {
    cachedGrowthBookFeatures: { tengu_a: true, tengu_new: 1 },
    cachedGrowthBookFeaturesAt: 5,
  };
  writeFileSync(
    join(turn.configDir, CLAUDE_GLOBAL_CONFIG),
    JSON.stringify({ ...refreshed, numStartups: 1, userID: "cli-install" }),
  );
  const { store, uploads } = fakeStore();
  await persistTurnClaudeFlags({
    store,
    prefix: "ws/org/agent",
    filesystem: { dataDir: turn.dataDir, dataRel },
    root: turn.root,
    conversationId: "c1",
    userId: "user-alice",
  });
  expect(uploads).toEqual([
    {
      key: `ws/org/agent/${dataRel}/claude-flags/${claudeFlagsFileName("user-alice")}`,
      body: refreshed,
    },
  ]);
});

test("an unchanged cache, a flagless config, or no member stores nothing", async () => {
  const turn = turnRoot({ "user-alice": aliceFlags });
  mkdirSync(turn.configDir, { recursive: true });
  const config = join(turn.configDir, CLAUDE_GLOBAL_CONFIG);
  const { store, uploads } = fakeStore();
  const persist = (userId: string | undefined) =>
    persistTurnClaudeFlags({
      store,
      prefix: "",
      filesystem: { dataDir: turn.dataDir, dataRel },
      root: turn.root,
      conversationId: "c1",
      userId,
    });
  await persist("user-alice");
  writeFileSync(config, JSON.stringify({ ...aliceFlags, numStartups: 2 }));
  await persist("user-alice");
  await persist(undefined);
  writeFileSync(config, JSON.stringify({ cachedGrowthBookFeatures: {} }));
  await persist("user-alice");
  expect(uploads).toEqual([]);
});

test("a corrupt stored cache is replaced by the refreshed one", async () => {
  const turn = turnRoot({ "user-alice": "{truncated" });
  mkdirSync(turn.configDir, { recursive: true });
  writeFileSync(
    join(turn.configDir, CLAUDE_GLOBAL_CONFIG),
    JSON.stringify(aliceFlags),
  );
  const { store, uploads } = fakeStore();
  await persistTurnClaudeFlags({
    store,
    prefix: "",
    filesystem: { dataDir: turn.dataDir, dataRel },
    root: turn.root,
    conversationId: "c1",
    userId: "user-alice",
  });
  expect(uploads.map(({ body }) => body)).toEqual([aliceFlags]);
});

test("a refused upload is reported and never fails the turn", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const turn = turnRoot();
  mkdirSync(turn.configDir, { recursive: true });
  writeFileSync(
    join(turn.configDir, CLAUDE_GLOBAL_CONFIG),
    JSON.stringify(aliceFlags),
  );
  const { store } = fakeStore(new Error("key outside claim scope (403)"));
  await expect(
    persistTurnClaudeFlags({
      store,
      prefix: "",
      filesystem: { dataDir: turn.dataDir, dataRel },
      root: turn.root,
      conversationId: "c1",
      userId: "user-alice",
    }),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("could not store the flag cache"),
  );
});

test("a stalled upload gives up at its deadline, reported", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const turn = turnRoot();
  mkdirSync(turn.configDir, { recursive: true });
  writeFileSync(
    join(turn.configDir, CLAUDE_GLOBAL_CONFIG),
    JSON.stringify(aliceFlags),
  );
  let signal: AbortSignal | undefined;
  const store = {
    upload: (_src: string, _key: string, opts?: { signal?: AbortSignal }) => {
      signal = opts?.signal;
      return new Promise(() => {});
    },
  } as unknown as ObjectStore;
  await persistTurnClaudeFlags({
    store,
    prefix: "",
    filesystem: { dataDir: turn.dataDir, dataRel },
    root: turn.root,
    conversationId: "c1",
    userId: "user-alice",
    deadlineMs: 20,
  });
  expect(signal?.aborted).toBe(true);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("could not store the flag cache"),
  );
});
