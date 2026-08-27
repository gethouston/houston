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
  StoreFencedError,
} from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { StoreSyncDaemon } from "./daemon";

// Headroom over eventually()'s 15s deadline; the default 5s test timeout
// left none and made these watcher-driven tests flake under suite load.
vi.setConfig({ testTimeout: 20_000 });

function setup() {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const store = new LocalDirStore(remoteRoot);
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store,
    rootDir: localRoot,
    quietMs: 20,
    // Short interval: macOS FSEvents subscriptions activate asynchronously,
    // so a write landing right after start() can be missed by the watcher.
    // The periodic sync is the daemon's designed fallback for exactly that;
    // give it a test-scale period instead of the production 5 minutes.
    intervalMs: 250,
    log: (message, err) => logs.push({ message, err }),
  });
  return { daemon, localRoot, logs, remoteRoot, store };
}

// Generous deadline: these tests ride real FS-watcher events and debounce
// timers, which slip well past the nominal quiet period when the suite runs
// under full-worker load. Polling keeps green runs fast regardless.
async function eventually(assertion: () => void, timeoutMs = 15_000) {
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

test("a change inside an excluded watch subtree still syncs via the periodic pass (HOU-1237)", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-local-"));
  const excludedDir = join(localRoot, "excluded");
  mkdirSync(excludedDir, { recursive: true });
  const daemon = new StoreSyncDaemon({
    store: new LocalDirStore(remoteRoot),
    rootDir: localRoot,
    quietMs: 20,
    intervalMs: 250,
    watchExcludeDirs: [excludedDir],
    log: () => {},
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(excludedDir, "created.txt"), "created");
  await eventually(() => {
    expect(
      readFileSync(join(remoteRoot, "excluded", "created.txt"), "utf8"),
    ).toBe("created");
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
    "shared-mirror/skills/org/SKILL.md": "read-only cache",
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
    readFileSync(
      join(remoteRoot, "shared-mirror", "skills", "org", "SKILL.md"),
    ),
  ).toThrow();
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
    intervalMs: 250, // see setup(): fallback for missed watcher startup events
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
    intervalMs: 250, // see setup(): fallback for missed watcher startup events
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

test("a fencing loss latches once, halts scheduling, and skips the final drain", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-fenced-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-fenced-local-"));
  mkdirSync(join(remoteRoot, "workspace"), { recursive: true });
  writeFileSync(join(remoteRoot, "workspace", "notes.txt"), "remote");
  const inner = new LocalDirStore(remoteRoot);
  let uploads = 0;
  const fencedStore: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    manifest: async () => [
      {
        key: "workspace/notes.txt",
        size: 6,
        md5: "md5",
        updated: "2026-08-12T00:00:00Z",
        generation: "1",
      },
    ],
    download: (key, dest) => inner.download(key, dest),
    upload: async (_source, key) => {
      uploads += 1;
      throw new StoreFencedError(key, "lease lost");
    },
    delete: (key, opts) => inner.delete(key, opts),
  };
  const logs: Array<{ err?: unknown; message: string }> = [];
  const daemon = new StoreSyncDaemon({
    store: fencedStore,
    rootDir: localRoot,
    quietMs: 5,
    intervalMs: 20,
    log: (message, err) => logs.push({ message, err }),
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "workspace", "notes.txt"), "local edit");

  await eventually(() => expect(daemon.fenced).toBe(true));
  expect(uploads).toBe(1);
  writeFileSync(join(localRoot, "workspace", "notes.txt"), "later edit");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await daemon.stop();

  expect(uploads).toBe(1);
  const fencingLogs = logs.filter((entry) =>
    entry.message.includes("write fencing lost"),
  );
  expect(fencingLogs).toHaveLength(1);
  // Info-level breadcrumb, not an error: fencing loss is a designed lifecycle
  // outcome, so the log must not carry the error object (the severity log
  // routes any entry WITH an error to Sentry as an error event).
  expect(fencingLogs[0]?.err).toBeUndefined();
  expect(fencingLogs[0]?.message).toContain("lease lost");
});

test("the final sync retries a shutdown blip and flushes on a later attempt (HOUSTON-APP-58V)", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-final-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-final-local-"));
  const inner = new LocalDirStore(remoteRoot);
  let failures = 0;
  const flaky: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    download: (key, dest) => inner.download(key, dest),
    upload: (src, key) => {
      if (failures < 1) {
        failures += 1;
        return Promise.reject(new TypeError("fetch failed"));
      }
      return inner.upload(src, key);
    },
    delete: (key) => inner.delete(key),
  };
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store: flaky,
    rootDir: localRoot,
    quietMs: 60_000,
    intervalMs: 60_000,
    finalSyncRetryDelaysMs: [5],
    log: (message, err) => logs.push({ message, err }),
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "final.txt"), "final");
  await daemon.stop();

  // The blip was absorbed: the file flushed, the retry logged as an err-less
  // breadcrumb with the cause inlined, and nothing reported as an error.
  expect(readFileSync(join(remoteRoot, "final.txt"), "utf8")).toBe("final");
  const finalFailures = logs.filter((l) =>
    l.message.includes("FINAL sync failed"),
  );
  expect(finalFailures).toHaveLength(1);
  expect(finalFailures[0]?.err).toBeUndefined();
  expect(finalFailures[0]?.message).toContain("fetch failed");
});

test("the final sync reports with the error only after exhausting its retries", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-final-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-final-local-"));
  const inner = new LocalDirStore(remoteRoot);
  let attempts = 0;
  const dead: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    download: (key, dest) => inner.download(key, dest),
    upload: () => {
      attempts += 1;
      return Promise.reject(new TypeError("fetch failed"));
    },
    delete: (key) => inner.delete(key),
  };
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store: dead,
    rootDir: localRoot,
    quietMs: 60_000,
    intervalMs: 60_000,
    finalSyncRetryDelaysMs: [5, 5],
    log: (message, err) => logs.push({ message, err }),
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "final.txt"), "final");
  await daemon.stop();

  expect(attempts).toBe(3);
  const finalFailures = logs.filter((l) =>
    l.message.includes("FINAL sync failed"),
  );
  expect(finalFailures).toHaveLength(3);
  expect(finalFailures[0]?.err).toBeUndefined();
  expect(finalFailures[1]?.err).toBeUndefined();
  expect(finalFailures[2]?.err).toBeDefined();
  expect(finalFailures[2]?.message).toContain("local changes may be lost");
});

test("a transient sync failure is a breadcrumb; only a streak reports the error", async () => {
  const remoteRoot = mkdtempSync(join(tmpdir(), "store-sync-flaky-remote-"));
  const localRoot = mkdtempSync(join(tmpdir(), "store-sync-flaky-local-"));
  const inner = new LocalDirStore(remoteRoot);
  let failing = true;
  const flaky: ObjectStore = {
    list: (prefix) => inner.list(prefix),
    download: (key, dest) => inner.download(key, dest),
    upload: (src, key) => {
      if (failing) return Promise.reject(new TypeError("fetch failed"));
      return inner.upload(src, key);
    },
    delete: (key) => inner.delete(key),
  };
  const logs: Array<{ message: string; err?: unknown }> = [];
  const daemon = new StoreSyncDaemon({
    store: flaky,
    rootDir: localRoot,
    quietMs: 20,
    intervalMs: 40,
    log: (message, err) => logs.push({ message, err }),
  });
  await daemon.hydrate();
  daemon.start();
  writeFileSync(join(localRoot, "notes.txt"), "notes");

  const failures = () => logs.filter((l) => l.message.includes("sync failed"));
  await eventually(() => expect(failures().length).toBeGreaterThanOrEqual(4));

  // Deploy-window blips (the first two passes) stay err-less breadcrumbs with
  // the cause inlined; the sustained streak reports with the error attached.
  expect(failures()[0]?.err).toBeUndefined();
  expect(failures()[0]?.message).toContain("fetch failed");
  expect(failures()[1]?.err).toBeUndefined();
  expect(failures().some((l) => l.err !== undefined)).toBe(true);

  // Recovery resets the streak: the next lone failure is a breadcrumb again.
  failing = false;
  await eventually(() =>
    expect(readFileSync(join(remoteRoot, "notes.txt"), "utf8")).toBe("notes"),
  );
  failing = true;
  writeFileSync(join(localRoot, "notes.txt"), "notes v2");
  const seen = failures().length;
  await eventually(() => expect(failures().length).toBeGreaterThan(seen));
  expect(failures()[seen]?.err).toBeUndefined();

  failing = false;
  await daemon.stop();
});
