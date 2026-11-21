import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { syncTurnFilesystem } from "./turn-filesystem";

const PREFIX = "ws/w1/agent-1";
const AGENT = "workspaces/Personal/Bob";
const CLONE_OBJECTS = 2_000;
const OTHER_CONVERSATIONS = 300;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function temp(name: string) {
  const dir = mkdtempSync(join(tmpdir(), name));
  dirs.push(dir);
  return dir;
}

const STARTUP_SET = [
  `${AGENT}/CLAUDE.md`,
  `${AGENT}/.houston/runtime/settings.json`,
  `${AGENT}/.houston/runtime/conversations/c1.json`,
  `${AGENT}/.houston/state/watermark.json`,
  `${AGENT}/.agents/skills/a/SKILL.md`,
  `${AGENT}/.claude/settings.json`,
];

function put(storeRoot: string, rel: string, body: string) {
  const path = join(storeRoot, PREFIX, ...rel.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function largeStore(): string {
  const storeRoot = temp("startup-set-store-");
  for (const rel of STARTUP_SET) put(storeRoot, rel, "{}");
  for (let i = 0; i < CLONE_OBJECTS; i++) {
    put(storeRoot, `${AGENT}/.repo-web/.git/objects/${i % 256}/${i}`, `o${i}`);
  }
  put(storeRoot, `${AGENT}/.repo-web/README.md`, "readme");
  put(storeRoot, `${AGENT}/.repo-web/old.txt`, "old");
  put(storeRoot, `${AGENT}/.venv/bin/tool`, "tool");
  put(storeRoot, `${AGENT}/reports/q3.md`, "q3");
  for (let i = 0; i < OTHER_CONVERSATIONS; i++) {
    put(storeRoot, `${AGENT}/.houston/runtime/conversations/r${i}.json`, "{}");
  }
  put(storeRoot, "claude-login/projects/p/s.jsonl", "{}");
  return storeRoot;
}

function holdingStore(inner: LocalDirStore) {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = new Set<string>();
  const startup = new Set(STARTUP_SET.map((rel) => `${PREFIX}/${rel}`));
  const store: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: async (key, destination, options) => {
      if (!startup.has(key)) {
        held.add(key);
        await released;
      }
      await inner.download(key, destination, options);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  return { store, held, release };
}

async function claimedTurn(store: ObjectStore) {
  return startTurnRequestFilesystem({
    store,
    prefix: PREFIX,
    root: temp("startup-set-root-"),
    turn: {
      claim: {
        id: "claim-1",
        token: "token-1",
        bootId: "boot-1",
        heartbeatUrl: "https://heartbeat.test",
      },
      conversationId: "c1",
    },
    timings: {},
  });
}

test("a claimed turn on a large store reaches its prompt with only the startup set", async () => {
  const inner = new LocalDirStore(largeStore());
  const { store, held, release } = holdingStore(inner);
  const preparation = await claimedTurn(store);
  const outcome = await Promise.race([
    preparation.hydrated.then(() => "hydrated" as const),
    new Promise<"waiting">((resolve) =>
      setTimeout(() => resolve("waiting"), 2_000),
    ),
  ]);
  expect(outcome).toBe("hydrated");
  const fs = preparation.filesystem;
  for (const rel of STARTUP_SET) {
    expect(existsSync(join(fs.storeRoot, ...rel.split("/")))).toBe(true);
  }
  expect(existsSync(join(fs.workspaceDir, ".repo-web", "README.md"))).toBe(
    false,
  );
  expect(fs.workspaceReady).toBeDefined();

  release();
  await fs.workspaceReady;
  expect(existsSync(join(fs.workspaceDir, ".repo-web", "README.md"))).toBe(
    true,
  );
  expect(existsSync(join(fs.workspaceDir, ".venv", "bin", "tool"))).toBe(true);
  expect(existsSync(join(fs.workspaceDir, "reports", "q3.md"))).toBe(true);
  expect(held.size).toBe(CLONE_OBJECTS + 4);
  const synced = await syncTurnFilesystem({
    store: inner,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
});

test("a tool's edits in a deferred hidden folder sync back", async () => {
  const storeRoot = largeStore();
  const inner = new LocalDirStore(storeRoot);
  const { store, release } = holdingStore(inner);
  release();
  const preparation = await claimedTurn(store);
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  const clone = join(fs.workspaceDir, ".repo-web");
  writeFileSync(join(clone, "README.md"), "edited");
  writeFileSync(join(clone, "new.txt"), "new");
  rmSync(join(clone, "old.txt"));
  const synced = await syncTurnFilesystem({
    store: inner,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded.toSorted()).toEqual([
    `${AGENT}/.repo-web/README.md`,
    `${AGENT}/.repo-web/new.txt`,
  ]);
  expect(synced.deleted).toEqual([`${AGENT}/.repo-web/old.txt`]);
  const stored = join(storeRoot, PREFIX, AGENT, ".repo-web");
  expect(readFileSync(join(stored, "README.md"), "utf8")).toBe("edited");
  expect(existsSync(join(stored, "old.txt"))).toBe(false);
});

test("a failed deferred download leaves the hidden folders in the store alone", async () => {
  const storeRoot = largeStore();
  const inner = new LocalDirStore(storeRoot);
  const failing: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: async (key, destination, options) => {
      if (key.endsWith("/.repo-web/README.md"))
        throw new Error("store unreachable");
      await inner.download(key, destination, options);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  const preparation = await claimedTurn(failing);
  const fs = await preparation.hydrated;
  await expect(fs.workspaceReady).rejects.toThrow(/store unreachable/);
  const synced = await syncTurnFilesystem({
    store: inner,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
  const stored = join(storeRoot, PREFIX, AGENT, ".repo-web");
  expect(readFileSync(join(stored, "README.md"), "utf8")).toBe("readme");
  expect(existsSync(join(stored, "old.txt"))).toBe(true);
});
