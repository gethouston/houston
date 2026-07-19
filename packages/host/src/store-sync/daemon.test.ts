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
  ObjectTooLargeError,
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

test("warns only after synced data crosses 80% of the hydration cap", async () => {
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
  daemon.start();
  await new Promise<void>((resolve) => setImmediate(resolve));

  writeFileSync(join(localRoot, "small.bin"), Buffer.alloc(500));
  await eventually(() =>
    expect(readFileSync(join(remoteRoot, "small.bin")).length).toBe(500),
  );
  expect(logs.some((message) => message.includes("hydration cap"))).toBe(false);

  writeFileSync(join(localRoot, "large.bin"), Buffer.alloc(400));
  await eventually(() =>
    expect(logs.some((message) => message.includes("hydration cap"))).toBe(
      true,
    ),
  );
  await daemon.stop();
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

test("an over-cap file logs an err-less breadcrumb once and never blocks other files", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const inner = new LocalDirStore(remoteRoot);
  const capped: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    download: (key, dest) => inner.download(key, dest),
    upload: (src, key) => {
      if (key.endsWith("huge.mp4"))
        return Promise.reject(
          new ObjectTooLargeError(key, `object store PUT ${key} failed (413)`),
        );
      return inner.upload(src, key);
    },
    delete: (key) => inner.delete(key),
  };
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store: capped,
    rootDir: localRoot,
    quietMs: 20,
    intervalMs: 60_000,
    log: (message, err) => logs.push({ message, err }),
  });
  await daemon.hydrate();
  writeFileSync(join(localRoot, "huge.mp4"), "H".repeat(64));
  writeFileSync(join(localRoot, "notes.txt"), "notes");
  await daemon.stop(); // stop() runs the final sync pass

  // The other file persisted, the skip logged WITHOUT an err (breadcrumb, not
  // a Sentry error), and no "sync failed" error was recorded.
  expect(readFileSync(join(remoteRoot, "notes.txt"), "utf8")).toBe("notes");
  const skips = logs.filter((l) => l.message.includes("per-object cap"));
  expect(skips).toHaveLength(1);
  expect(skips[0]?.err).toBeUndefined();
  expect(logs.some((l) => l.message.includes("sync failed"))).toBe(false);
});
