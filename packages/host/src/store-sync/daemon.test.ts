import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { StoreSyncDaemon } from "./daemon";

function setup() {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const store = new LocalDirStore(remoteRoot);
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store,
    rootDir: localRoot,
    quietMs: 20,
    intervalMs: 60_000,
    log: (message, err) => logs.push({ message, err }),
  });
  return { daemon, localRoot, logs, remoteRoot, store };
}

async function eventually(assertion: () => void, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let error: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (err) {
      error = err;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw error;
}

test("hydrates the cache and keeps unchanged objects in its baseline", async () => {
  const { daemon, localRoot, remoteRoot } = setup();
  mkdirSync(join(remoteRoot, "workspace"), { recursive: true });
  writeFileSync(join(remoteRoot, "workspace", "notes.txt"), "remote");
  await daemon.hydrate();
  expect(readFileSync(join(localRoot, "workspace", "notes.txt"), "utf8")).toBe(
    "remote",
  );
  await daemon.stop();
  expect(readFileSync(join(remoteRoot, "workspace", "notes.txt"), "utf8")).toBe(
    "remote",
  );
});

test("uploads created files after the quiet period", async () => {
  const { daemon, localRoot, remoteRoot } = setup();
  await daemon.hydrate();
  daemon.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  writeFileSync(join(localRoot, "created.txt"), "created");
  await eventually(() => {
    expect(readFileSync(join(remoteRoot, "created.txt"), "utf8")).toBe(
      "created",
    );
  });
  await daemon.stop();
});

test("deletes remotely when a hydrated file is deleted locally", async () => {
  const { daemon, localRoot, remoteRoot } = setup();
  writeFileSync(join(remoteRoot, "delete-me.txt"), "old");
  await daemon.hydrate();
  daemon.start();
  rmSync(join(localRoot, "delete-me.txt"));
  await eventually(() =>
    expect(() => readFileSync(join(remoteRoot, "delete-me.txt"))).toThrow(),
  );
  await daemon.stop();
});

test("never uploads credentials, db files, temp files, or runtime auth", async () => {
  const { daemon, localRoot, remoteRoot } = setup();
  await daemon.hydrate();
  daemon.start();
  const files = {
    "credentials.json": "secret",
    "claude-login/.credentials.json": "secret",
    "db/houston.db": "db",
    "workspace/write.tmp": "temp",
    "workspaces/W/A/.houston/runtime/auth.json": "token",
    "claude-login/projects/resume.json": "resume",
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = join(localRoot, ...rel.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  await daemon.stop();
  expect(() => readFileSync(join(remoteRoot, "credentials.json"))).toThrow();
  expect(() =>
    readFileSync(join(remoteRoot, "claude-login", ".credentials.json")),
  ).toThrow();
  expect(() => readFileSync(join(remoteRoot, "db", "houston.db"))).toThrow();
  expect(() =>
    readFileSync(join(remoteRoot, "workspace", "write.tmp")),
  ).toThrow();
  expect(() =>
    readFileSync(
      join(
        remoteRoot,
        "workspaces",
        "W",
        "A",
        ".houston",
        "runtime",
        "auth.json",
      ),
    ),
  ).toThrow();
  expect(
    readFileSync(
      join(remoteRoot, "claude-login", "projects", "resume.json"),
      "utf8",
    ),
  ).toBe("resume");
});

test("strictly serializes sync attempts", async () => {
  const { localRoot, remoteRoot } = setup();
  const delegate = new LocalDirStore(remoteRoot);
  let active = 0;
  let maxActive = 0;
  const slowStore: ObjectStore = {
    list: (prefix) => delegate.list(prefix),
    download: (key, dest) => delegate.download(key, dest),
    upload: async (source, key) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await delegate.upload(source, key);
      active -= 1;
    },
    delete: (key) => delegate.delete(key),
  };
  const daemon = new StoreSyncDaemon({
    store: slowStore,
    rootDir: localRoot,
    quietMs: 5,
    intervalMs: 10,
    log: () => {},
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "one.txt"), "one");
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileSync(join(localRoot, "two.txt"), "two");
  await eventually(() =>
    expect(readFileSync(join(remoteRoot, "two.txt"), "utf8")).toBe("two"),
  );
  await daemon.stop();
  expect(maxActive).toBe(1);
});

test("stop performs a final sync without waiting for the debounce", async () => {
  const { daemon, localRoot, remoteRoot } = setup();
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "final.txt"), "final");
  await daemon.stop();
  expect(readFileSync(join(remoteRoot, "final.txt"), "utf8")).toBe("final");
});

test("failed hydration prevents start and never uploads the local tree", async () => {
  const { localRoot, remoteRoot } = setup();
  writeFileSync(join(localRoot, "must-not-upload.txt"), "local");
  let uploads = 0;
  const broken: ObjectStore = {
    list: async () => {
      throw new Error("store unavailable");
    },
    download: async () => {},
    upload: async () => {
      uploads += 1;
    },
    delete: async () => {},
  };
  const daemon = new StoreSyncDaemon({
    store: broken,
    rootDir: localRoot,
    log: () => {},
  });
  await expect(daemon.hydrate()).rejects.toThrow("store unavailable");
  expect(() => daemon.start()).toThrow("before successful hydration");
  await daemon.stop();
  expect(uploads).toBe(0);
  expect(await new LocalDirStore(remoteRoot).list("")).toEqual([]);
});

test("warns when synced data crosses 80% of the hydration cap", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const logs: string[] = [];
  const daemon = new StoreSyncDaemon({
    store: new LocalDirStore(remoteRoot),
    rootDir: localRoot,
    quietMs: 20,
    maxHydrateBytes: 1000,
    log: (message) => logs.push(message),
  });
  await daemon.hydrate();

  // 500 bytes = half the cap: syncs quietly.
  writeFileSync(join(localRoot, "small.bin"), Buffer.alloc(500));
  daemon.start();
  await eventually(() =>
    expect(readFileSync(join(remoteRoot, "small.bin")).length).toBe(500),
  );
  await daemon.stop();
  expect(logs.filter((m) => m.includes("hydration cap"))).toEqual([]);
});

test("final sync warns when the tree is past 80% of the cap", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const logs: string[] = [];
  const daemon = new StoreSyncDaemon({
    store: new LocalDirStore(remoteRoot),
    rootDir: localRoot,
    quietMs: 20,
    maxHydrateBytes: 1000,
    log: (message) => logs.push(message),
  });
  await daemon.hydrate();
  writeFileSync(join(localRoot, "big.bin"), Buffer.alloc(900));
  daemon.start();
  await daemon.stop(); // final sync sees 900/1000 bytes
  expect(logs.some((m) => m.includes("hydration cap"))).toBe(true);
});
