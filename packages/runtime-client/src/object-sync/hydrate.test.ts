import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  excluded,
  type HydrateLimitError,
  hydrate,
  startHydrate,
  syncBack,
} from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import {
  LocalDirStore,
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
  StoreFencedError,
} from "./object-store";

/**
 * The hydrate-to-sync loop pins faithful materialization, content diffing,
 * manifest ownership, secret exclusions, symlink safety, and hydration limits.
 */

function setup() {
  const storeRoot = mkdtempSync(join(tmpdir(), "houston-store-"));
  const store = new LocalDirStore(storeRoot);
  const work = mkdtempSync(join(tmpdir(), "houston-hyd-"));
  return { storeRoot, store, work };
}

function seed(
  storeRoot: string,
  prefix: string,
  files: Record<string, string>,
) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(storeRoot, ...prefix.split("/"), ...rel.split("/"));
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
}

const PREFIX = "ws/w1/agent-1";

function metadata(key: string, generation: string): ObjectMetadata {
  return {
    key,
    size: 1,
    md5: "md5",
    updated: "2026-08-12T00:00:00Z",
    generation,
  };
}

test("hydrate materializes the prefix and syncBack returns the new manifest", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "workspace/notes.txt": "v1",
    "workspace/sub/deep.txt": "deep",
    "data/conversations/c1.json": "{}",
  });

  const manifest = await hydrate(store, PREFIX, work);
  expect(readFileSync(join(work, "workspace", "notes.txt"), "utf8")).toBe("v1");
  expect(readFileSync(join(work, "workspace", "sub", "deep.txt"), "utf8")).toBe(
    "deep",
  );
  expect(manifest.size).toBe(3);

  writeFileSync(join(work, "workspace", "notes.txt"), "v2");
  writeFileSync(join(work, "workspace", "deck.pptx"), "DECK");
  rmSync(join(work, "workspace", "sub", "deep.txt"));

  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded.sort()).toEqual([
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
  expect(result.deleted).toEqual(["workspace/sub/deep.txt"]);
  expect([...result.manifest.keys()].sort()).toEqual([
    "data/conversations/c1.json",
    "workspace/deck.pptx",
    "workspace/notes.txt",
  ]);
  expect(result.totalBytes).toBe(8);
});

test("empty prefix hydrates agent-relative keys", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, "", { "workspace/notes.txt": "hello" });
  const manifest = await hydrate(store, "", work);
  expect(readFileSync(join(work, "workspace", "notes.txt"), "utf8")).toBe(
    "hello",
  );
  expect([...manifest.keys()]).toEqual(["workspace/notes.txt"]);
});

test("auth.json never hydrates in and never syncs out", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "data/auth.json": JSON.stringify({ leaked: "stale-token" }),
    "workspace/file.txt": "x",
  });
  const manifest = await hydrate(store, PREFIX, work);
  expect(manifest.has("data/auth.json")).toBe(false);
  mkdirSync(join(work, "data"), { recursive: true });
  writeFileSync(join(work, "data", "auth.json"), '{"access":"AT-turn"}');
  expect((await syncBack(store, PREFIX, work, manifest)).uploaded).toEqual([]);
  expect(
    (await store.list(PREFIX)).some((key) => key.endsWith("data/auth.json")),
  ).toBe(true);
});

test("exclusions support basenames, subtrees, temp files, and runtime auth", () => {
  const excludes = [
    "credentials.json",
    "claude-login/.credentials.json",
    "db/",
  ];
  expect(excluded("credentials.json", excludes)).toBe(true);
  expect(excluded("nested/credentials.json", excludes)).toBe(true);
  expect(excluded("db/houston.db", excludes)).toBe(true);
  expect(excluded("workspace/write.tmp", excludes)).toBe(true);
  expect(excluded("workspaces/W/A/.houston/runtime/auth.json", excludes)).toBe(
    true,
  );
  expect(excluded("claude-login/projects/cache.json", excludes)).toBe(false);
});

/**
 * The store-sync daemon's excludes, including the root-relative `auth-users/`
 * entry it used to carry: the per-member credential directory must stay
 * excluded at EVERY depth even when no caller configures it, because a
 * root-relative pattern can never match the real nested key.
 */
const DAEMON_EXCLUDES = [
  "credentials.json",
  "auth-users/",
  "claude-login/.credentials.json",
  "db/",
];

const POD_AUTH_USERS = "workspaces/W/A/.houston/runtime/auth-users";

test("per-member credential files are excluded at any depth", () => {
  // The daemon runs with rootDir = HOUSTON_HOME, so the real key is nested
  // under the agent's runtime dir — the shape that leaked one member's tokens.
  expect(excluded(`${POD_AUTH_USERS}/abc123.json`, DAEMON_EXCLUDES)).toBe(true);
  expect(
    excluded(`${POD_AUTH_USERS}/abc123.served-providers.json`, DAEMON_EXCLUDES),
  ).toBe(true);
  expect(excluded("auth-users/abc123.json", DAEMON_EXCLUDES)).toBe(true);
  // The per-turn layout puts the same directory one level down.
  expect(excluded("data/auth-users/abc123.json", DAEMON_EXCLUDES)).toBe(true);
  // The TEAM served-providers manifest is shared state and DOES sync: the
  // segment rule must not swallow everything named after credentials.
  expect(
    excluded(
      "workspaces/W/A/.houston/runtime/served-providers.json",
      DAEMON_EXCLUDES,
    ),
  ).toBe(false);
});

test("nested auth-users files never sync out to the shared store", async () => {
  const { storeRoot, store, work } = setup();
  const authUsersDir = join(work, ...POD_AUTH_USERS.split("/"));
  mkdirSync(authUsersDir, { recursive: true });
  writeFileSync(join(authUsersDir, "abc123.json"), '{"access":"AT-alice"}');
  writeFileSync(
    join(authUsersDir, "abc123.served-providers.json"),
    '["anthropic"]',
  );
  mkdirSync(join(work, "workspaces", "W", "A", "workspace"), {
    recursive: true,
  });
  writeFileSync(join(work, "workspaces", "W", "A", "workspace", "n.txt"), "n");

  const result = await syncBack(store, "", work, new Map(), {
    excludes: DAEMON_EXCLUDES,
  });
  expect(result.uploaded).toEqual(["workspaces/W/A/workspace/n.txt"]);
  expect([...result.manifest.keys()]).toEqual([
    "workspaces/W/A/workspace/n.txt",
  ]);
  expect((await store.list("")).some((key) => key.includes("auth-users"))).toBe(
    false,
  );
  expect(existsSync(join(storeRoot, ...POD_AUTH_USERS.split("/")))).toBe(false);
});

test("nested auth-users objects never hydrate into a pod", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, "", {
    [`${POD_AUTH_USERS}/abc123.json`]: '{"access":"AT-alice"}',
    "workspaces/W/A/workspace/n.txt": "n",
  });
  const manifest = await hydrate(store, "", work, {
    excludes: DAEMON_EXCLUDES,
  });
  expect([...manifest.keys()]).toEqual(["workspaces/W/A/workspace/n.txt"]);
  expect(existsSync(join(work, ...POD_AUTH_USERS.split("/")))).toBe(false);
});

test("an unchanged workspace uploads nothing and remains in the manifest", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  const manifest = await hydrate(store, PREFIX, work);
  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.deleted).toEqual([]);
  expect(result.manifest).toEqual(manifest);
});

test("uses hydrated generations for known, new, deleted, and unchanged files", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "workspace/changed.txt": "v1",
    "workspace/delete.txt": "delete",
    "workspace/unchanged.txt": "same",
  });
  const generations = new Map([
    [`${PREFIX}/workspace/changed.txt`, "10"],
    [`${PREFIX}/workspace/delete.txt`, "20"],
    [`${PREFIX}/workspace/unchanged.txt`, "30"],
  ]);
  const writes: Array<{
    key: string;
    operation: "delete" | "upload";
    precondition?: string;
  }> = [];
  const versioned: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async (prefix = "") =>
      (await store.list(prefix)).map((key) =>
        metadata(key, generations.get(key) ?? "1"),
      ),
    download: (key, dest) => store.download(key, dest),
    upload: async (src, key, opts) => {
      writes.push({
        key,
        operation: "upload",
        precondition: opts?.ifGenerationMatch,
      });
      await store.upload(src, key);
      const generation = String(Number(generations.get(key) ?? "0") + 1);
      generations.set(key, generation);
      return { generation };
    },
    delete: async (key, opts) => {
      writes.push({
        key,
        operation: "delete",
        precondition: opts?.ifGenerationMatch,
      });
      await store.delete(key);
    },
  };
  const manifest = await hydrate(versioned, PREFIX, work);
  writeFileSync(join(work, "workspace", "changed.txt"), "v2");
  writeFileSync(join(work, "workspace", "new.txt"), "new");
  rmSync(join(work, "workspace", "delete.txt"));

  const result = await syncBack(versioned, PREFIX, work, manifest);

  expect(writes).toEqual([
    {
      key: `${PREFIX}/workspace/changed.txt`,
      operation: "upload",
      precondition: "10",
    },
    {
      key: `${PREFIX}/workspace/new.txt`,
      operation: "upload",
      precondition: "0",
    },
    {
      key: `${PREFIX}/workspace/delete.txt`,
      operation: "delete",
      precondition: "20",
    },
  ]);
  expect(result.manifest.get("workspace/changed.txt")?.generation).toBe("11");
  expect(result.manifest.get("workspace/new.txt")?.generation).toBe("1");
  expect(result.manifest.get("workspace/unchanged.txt")?.generation).toBe("30");
});

test("explicit generations capability makes empty-prefix first creates conditional", async () => {
  const { store, work } = setup();
  const preconditions: Array<string | undefined> = [];
  const observing: ObjectStore = {
    list: (prefix) => store.list(prefix),
    download: (key, dest) => store.download(key, dest),
    upload: async (src, key, opts) => {
      preconditions.push(opts?.ifGenerationMatch);
      await store.upload(src, key);
      return { generation: "1" };
    },
    delete: (key) => store.delete(key),
  };
  mkdirSync(join(work, "workspace"), { recursive: true });
  writeFileSync(join(work, "workspace", "first.txt"), "born");

  // A cold agent has an EMPTY manifest: inference sees no generations, so
  // without the boot-lease capability signal this create would have to go
  // unconditional and concurrent first creates would be last-writer-wins.
  const result = await syncBack(observing, PREFIX, work, new Map(), {
    generations: true,
  });
  expect(preconditions).toEqual(["0"]);
  expect(result.manifest.get("workspace/first.txt")?.generation).toBe("1");

  // An explicit false forces unconditional writes even where an observed
  // generation would otherwise be sent (the signal outranks inference).
  preconditions.length = 0;
  writeFileSync(join(work, "workspace", "first.txt"), "changed");
  const manifest = new Map([
    ["workspace/first.txt", { hash: "stale", generation: "1" }],
  ]);
  await syncBack(observing, PREFIX, work, manifest, { generations: false });
  expect(preconditions).toEqual([undefined]);
});

test("refreshes generations once and records a second upload conflict", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/notes.txt": "v1" });
  let manifestCalls = 0;
  const preconditions: Array<string | undefined> = [];
  const conflicting: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => {
      manifestCalls += 1;
      return [
        metadata(
          `${PREFIX}/workspace/notes.txt`,
          manifestCalls === 1 ? "5" : "6",
        ),
      ];
    },
    download: (key, dest) => store.download(key, dest),
    upload: async (_src, key, opts) => {
      preconditions.push(opts?.ifGenerationMatch);
      throw new StoreConflictError(
        key,
        `conflict at ${opts?.ifGenerationMatch}`,
      );
    },
    delete: (key, opts) => store.delete(key, opts),
  };
  const manifest = await hydrate(conflicting, PREFIX, work);
  writeFileSync(join(work, "workspace", "notes.txt"), "v2");

  const result = await syncBack(conflicting, PREFIX, work, manifest);

  expect(preconditions).toEqual(["5", "6"]);
  expect(manifestCalls).toBe(2);
  expect(result.uploaded).toEqual([]);
  expect(result.conflicts).toEqual([
    { key: "workspace/notes.txt", reason: "conflict at 6" },
  ]);
  expect(result.manifest.get("workspace/notes.txt")).toMatchObject({
    generation: "6",
  });
});

test("a fenced upload aborts the sync pass immediately", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  const fenced: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => [metadata(`${PREFIX}/workspace/a.txt`, "5")],
    download: (key, dest) => store.download(key, dest),
    upload: async (_src, key) => {
      throw new StoreFencedError(key, "lease lost");
    },
    delete: (key, opts) => store.delete(key, opts),
  };
  const manifest = await hydrate(fenced, PREFIX, work);
  writeFileSync(join(work, "workspace", "a.txt"), "changed");

  await expect(syncBack(fenced, PREFIX, work, manifest)).rejects.toBeInstanceOf(
    StoreFencedError,
  );
});

test("a delete conflict refreshes the generation and retries successfully", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  let manifestCalls = 0;
  const preconditions: Array<string | undefined> = [];
  const conflicting: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => {
      manifestCalls += 1;
      return [
        metadata(`${PREFIX}/workspace/a.txt`, manifestCalls === 1 ? "5" : "6"),
      ];
    },
    download: (key, dest) => store.download(key, dest),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: async (key, opts) => {
      preconditions.push(opts?.ifGenerationMatch);
      if (opts?.ifGenerationMatch === "5") {
        throw new StoreConflictError(key, "stale generation");
      }
      await store.delete(key);
    },
  };
  const manifest = await hydrate(conflicting, PREFIX, work);
  rmSync(join(work, "workspace", "a.txt"));

  const result = await syncBack(conflicting, PREFIX, work, manifest);

  expect(preconditions).toEqual(["5", "6"]);
  expect(manifestCalls).toBe(2);
  expect(result.deleted).toEqual(["workspace/a.txt"]);
  expect(result.manifest.has("workspace/a.txt")).toBe(false);
  expect(result.conflicts).toEqual([]);
});

test("a second delete conflict preserves refreshed ownership for the next pass", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  let manifestCalls = 0;
  const preconditions: Array<string | undefined> = [];
  const conflicting: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => {
      manifestCalls += 1;
      return [
        metadata(`${PREFIX}/workspace/a.txt`, manifestCalls === 1 ? "5" : "6"),
      ];
    },
    download: (key, dest) => store.download(key, dest),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: async (key, opts) => {
      preconditions.push(opts?.ifGenerationMatch);
      throw new StoreConflictError(
        key,
        `conflict at ${opts?.ifGenerationMatch}`,
      );
    },
  };
  const manifest = await hydrate(conflicting, PREFIX, work);
  rmSync(join(work, "workspace", "a.txt"));

  const result = await syncBack(conflicting, PREFIX, work, manifest);

  expect(preconditions).toEqual(["5", "6"]);
  expect(manifestCalls).toBe(2);
  expect(result.deleted).toEqual([]);
  expect(result.manifest.get("workspace/a.txt")?.generation).toBe("6");
  expect(result.conflicts).toEqual([
    { key: "workspace/a.txt", reason: "conflict at 6" },
  ]);
});

test("a delete conflict whose refresh finds no object is already deleted", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  let manifestCalls = 0;
  let deleteCalls = 0;
  const conflicting: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => {
      manifestCalls += 1;
      return manifestCalls === 1
        ? [metadata(`${PREFIX}/workspace/a.txt`, "5")]
        : [];
    },
    download: (key, dest) => store.download(key, dest),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: async (key) => {
      deleteCalls += 1;
      throw new StoreConflictError(key, "stale generation");
    },
  };
  const manifest = await hydrate(conflicting, PREFIX, work);
  rmSync(join(work, "workspace", "a.txt"));

  const result = await syncBack(conflicting, PREFIX, work, manifest);

  expect(deleteCalls).toBe(1);
  expect(result.deleted).toEqual(["workspace/a.txt"]);
  expect(result.manifest.has("workspace/a.txt")).toBe(false);
  expect(result.conflicts).toEqual([]);
});

test("a delete conflict retries unconditionally after a generation-less refresh", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  let manifestCalls = 0;
  const preconditions: Array<string | undefined> = [];
  const conflicting: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: async () => {
      manifestCalls += 1;
      return [
        {
          ...metadata(`${PREFIX}/workspace/a.txt`, "5"),
          generation: manifestCalls === 1 ? "5" : undefined,
        },
      ];
    },
    download: (key, dest) => store.download(key, dest),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: async (key, opts) => {
      preconditions.push(opts?.ifGenerationMatch);
      if (opts?.ifGenerationMatch === "5") {
        throw new StoreConflictError(key, "stale generation");
      }
      await store.delete(key);
    },
  };
  const manifest = await hydrate(conflicting, PREFIX, work);
  rmSync(join(work, "workspace", "a.txt"));

  const result = await syncBack(conflicting, PREFIX, work, manifest);

  expect(preconditions).toEqual(["5", undefined]);
  expect(result.deleted).toEqual(["workspace/a.txt"]);
  expect(result.manifest.has("workspace/a.txt")).toBe(false);
  expect(result.conflicts).toEqual([]);
});

test("a file deleted mid-walk is reconciled as deleted, not a failed sync", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "workspace/a.txt": "a",
    "workspace/b.txt": "b",
    "workspace/c.txt": "c",
  });
  const manifest = await hydrate(store, PREFIX, work);
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    writeFileSync(join(work, "workspace", name), `changed-${name}`);
  }
  // The first upload deletes every other local file — whichever file the walk
  // visits first, the rest vanish between the walk and their stat/read, the
  // exact race an agent rewriting session files during a sync pass produces.
  let firstUpload = true;
  const racing = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) => {
      if (firstUpload) {
        firstUpload = false;
        for (const name of ["a.txt", "b.txt", "c.txt"]) {
          const abs = join(work, "workspace", name);
          if (abs !== src) rmSync(abs);
        }
      }
      return store.upload(src, key);
    },
    delete: (key: string) => store.delete(key),
  };
  const result = await syncBack(racing, PREFIX, work, manifest);
  expect(result.uploaded.length).toBe(1);
  expect(result.deleted.length).toBe(2);
  expect(result.manifest.size).toBe(1);
  const remaining = await store.list(PREFIX);
  expect(remaining.length).toBe(1);
});

test("a file deleted between hash and upload is reconciled, not a failed sync", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace", "a.txt"), "changed-a");
  writeFileSync(join(work, "workspace", "b.txt"), "changed-b");
  // The upload finds its own source gone: unlinked AFTER syncBack hashed it —
  // the second half of the vanish window (session files mid-rewrite), which
  // the mid-walk test above cannot reach.
  const racing = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) => {
      if (src.endsWith(join("workspace", "a.txt"))) rmSync(src);
      return store.upload(src, key);
    },
    delete: (key: string) => store.delete(key),
  };
  const result = await syncBack(racing, PREFIX, work, manifest);
  expect(result.uploaded).toEqual(["workspace/b.txt"]);
  expect(result.manifest.has("workspace/a.txt")).toBe(false);
  expect(result.deleted).toEqual(["workspace/a.txt"]);
});

test("a vanish surfacing as the fetch error's cause is reconciled too", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace", "a.txt"), "changed-a");
  // The streaming upload path hands the source to fetch, so the errno arrives
  // wrapped as the fetch failure's cause instead of the thrown error itself.
  const streaming = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: () => {
      throw new Error("fetch failed", {
        cause: Object.assign(new Error("no such file"), { code: "ENOENT" }),
      });
    },
    delete: (key: string) => store.delete(key),
  };
  const result = await syncBack(streaming, PREFIX, work, manifest);
  expect(result.uploaded).toEqual([]);
  expect(result.manifest.has("workspace/a.txt")).toBe(false);
});

test("symlinks created locally are never persisted", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a" });
  const manifest = await hydrate(store, PREFIX, work);
  symlinkSync("/etc/passwd", join(work, "workspace", "link"));
  expect((await syncBack(store, PREFIX, work, manifest)).uploaded).toEqual([]);
});

test("hydration size cap throws, never truncates silently", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/big.bin": "x".repeat(2048) });
  await expect(
    hydrate(store, PREFIX, work, { maxBytes: 1024 }),
  ).rejects.toEqual(
    expect.objectContaining({
      name: "HydrateLimitError",
      maxBytes: 1024,
    }) satisfies Partial<HydrateLimitError>,
  );
});

test("missing prefix hydrates to an empty manifest", async () => {
  const { store, work } = setup();
  expect((await hydrate(store, "ws/none/agent-x", work)).size).toBe(0);
});

test("hydrate materializes many files faithfully under concurrency", async () => {
  const { storeRoot, store, work } = setup();
  const files: Record<string, string> = {};
  for (let i = 0; i < 60; i++) files[`workspace/f${i}.txt`] = `content-${i}`;
  seed(storeRoot, PREFIX, files);

  const manifest = await hydrate(store, PREFIX, work, { concurrency: 16 });
  expect(manifest.size).toBe(60);
  for (let i = 0; i < 60; i++) {
    expect(readFileSync(join(work, "workspace", `f${i}.txt`), "utf8")).toBe(
      `content-${i}`,
    );
  }
});

test("startHydrate lands priority files before background hydration resolves", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {
    "data/settings.json": "settings",
    "workspace/late.txt": "late",
  });
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gated: ObjectStore = {
    list: (prefix) => store.list(prefix),
    manifest: (prefix) => store.manifest(prefix),
    download: async (key, destination) => {
      if (key.endsWith("workspace/late.txt")) await gate;
      await store.download(key, destination);
    },
    upload: (source, key, options) => store.upload(source, key, options),
    delete: (key, options) => store.delete(key, options),
  };

  const started = await startHydrate(gated, PREFIX, work, {
    priority: (rel) => rel === "data/settings.json",
  });

  expect(readFileSync(join(work, "data", "settings.json"), "utf8")).toBe(
    "settings",
  );
  expect(existsSync(join(work, "workspace", "late.txt"))).toBe(false);
  release();
  await started.done;
  expect(readFileSync(join(work, "workspace", "late.txt"), "utf8")).toBe(
    "late",
  );
  expect([...started.manifest.keys()].sort()).toEqual([
    "data/settings.json",
    "workspace/late.txt",
  ]);
});

test("a non-finite concurrency override still hydrates everything", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/a.txt": "a", "workspace/b.txt": "b" });
  // NaN would size the worker pool to zero and return a successful EMPTY
  // manifest — the partial-manifest state the hydration latch must prevent.
  const manifest = await hydrate(store, PREFIX, work, {
    concurrency: Number.NaN,
  });
  expect(manifest.size).toBe(2);
  expect(readFileSync(join(work, "workspace", "a.txt"), "utf8")).toBe("a");
});

test("a download failure rejects hydrate with that error, workers stop", async () => {
  const { storeRoot, store, work } = setup();
  const files: Record<string, string> = {};
  for (let i = 0; i < 30; i++) files[`workspace/f${i}.txt`] = `content-${i}`;
  seed(storeRoot, PREFIX, files);

  let downloads = 0;
  const flaky = {
    list: (prefix: string) => store.list(prefix),
    download: async (key: string, dest: string) => {
      downloads += 1;
      if (key.endsWith("f7.txt")) throw new Error("store download exploded");
      return store.download(key, dest);
    },
    upload: (src: string, key: string) => store.upload(src, key),
    delete: (key: string) => store.delete(key),
  };
  await expect(
    hydrate(flaky, PREFIX, work, { concurrency: 8 }),
  ).rejects.toThrow("store download exploded");
  // The failure parks the pool: no worker takes new work afterwards, so at
  // most the in-flight batch (< concurrency) follows the failing download.
  expect(downloads).toBeLessThan(30);
});

test("an over-cap rejection skips that file, syncs the rest, and completes the delete pass", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/old.txt": "old" });
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace", "huge.mp4"), "H".repeat(64));
  writeFileSync(join(work, "workspace", "notes.txt"), "notes");
  rmSync(join(work, "workspace", "old.txt"));
  const capped = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) => {
      // The cap is on SIZE, not identity: the shrunken re-write must go through.
      if (statSync(src).size > 32)
        return Promise.reject(
          new ObjectTooLargeError(key, `object store PUT ${key} failed (413)`),
        );
      return store.upload(src, key);
    },
    delete: (key: string) => store.delete(key),
  };

  const result = await syncBack(capped, PREFIX, work, manifest);
  // The rest of the pass survived the rejection: other uploads AND deletes ran.
  expect(result.uploaded).toEqual(["workspace/notes.txt"]);
  expect(result.deleted).toEqual(["workspace/old.txt"]);
  expect(result.skipped).toHaveLength(1);
  expect(result.skipped[0]?.key).toBe("workspace/huge.mp4");
  // The skip is remembered at the file's hash: an UNCHANGED file is not
  // re-attempted next pass (a deterministic 413 can never heal on retry)...
  expect(result.manifest.has("workspace/huge.mp4")).toBe(true);
  const again = await syncBack(capped, PREFIX, work, result.manifest);
  expect(again.skipped).toEqual([]);
  expect(again.uploaded).toEqual([]);
  // ...but a CHANGED file is (it may now fit under the cap).
  writeFileSync(join(work, "workspace", "huge.mp4"), "h");
  const changed = await syncBack(capped, PREFIX, work, again.manifest);
  expect(changed.uploaded).toEqual(["workspace/huge.mp4"]);
});

test("a non-cap upload failure still aborts the pass (data loss stays loud)", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {});
  const manifest = await hydrate(store, PREFIX, work);
  writeFileSync(join(work, "workspace-fail.txt"), "x");
  const failing = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: () => Promise.reject(new Error("object store PUT failed (500)")),
    delete: (key: string) => store.delete(key),
  };
  await expect(syncBack(failing, PREFIX, work, manifest)).rejects.toThrow(
    "500",
  );
});

test("a large file round-trips: streamed hash agrees across syncBack and hydrate", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, {});
  const manifest = await hydrate(store, PREFIX, work);
  mkdirSync(join(work, "workspace"), { recursive: true });
  // Over the 16 MiB streaming threshold — both the sync-back hash and the
  // re-hydration hash take the streamed path and must agree with each other.
  writeFileSync(
    join(work, "workspace", "big.bin"),
    "B".repeat(17 * 1024 * 1024),
  );
  const result = await syncBack(store, PREFIX, work, manifest);
  expect(result.uploaded).toEqual(["workspace/big.bin"]);
  expect(result.totalBytes).toBe(17 * 1024 * 1024);

  // Unchanged → the next pass re-hashes (streamed) and must NOT re-upload.
  const again = await syncBack(store, PREFIX, work, result.manifest);
  expect(again.uploaded).toEqual([]);

  // A fresh hydration (streamed hash of the downloaded copy) produces the
  // same manifest entry, so the first sync after a wake is also a no-op.
  const rehydrated = await hydrate(
    store,
    PREFIX,
    mkdtempSync(join(tmpdir(), "houston-rehyd-")),
    {
      maxBytes: 64 * 1024 * 1024,
    },
  );
  expect(rehydrated.get("workspace/big.bin")?.hash).toBe(
    result.manifest.get("workspace/big.bin")?.hash,
  );
});

test("holdDeletesOnFailure: a rename whose destination is refused keeps the source object", async () => {
  // A pool op renames a file that predates a store-cap reduction: the new key
  // is rejected (413). With deletes held, the old key — the ONLY durable
  // copy — survives; the default one-shot pass would have deleted it.
  const { storeRoot, store, work } = setup();
  seed(storeRoot, PREFIX, { "workspace/big.bin": "B".repeat(64) });
  const manifest = await hydrate(store, PREFIX, work);
  renameSync(
    join(work, "workspace", "big.bin"),
    join(work, "workspace", "renamed.bin"),
  );
  const capped = {
    list: (prefix: string) => store.list(prefix),
    download: (key: string, dest: string) => store.download(key, dest),
    upload: (src: string, key: string) =>
      statSync(src).size > 32
        ? Promise.reject(
            new ObjectTooLargeError(
              key,
              `object store PUT ${key} failed (413)`,
            ),
          )
        : store.upload(src, key),
    delete: (key: string) => store.delete(key),
  };
  const held = await syncBack(capped, PREFIX, work, manifest, {
    holdDeletesOnFailure: true,
  });
  expect(held.skipped.map((s) => s.key)).toEqual(["workspace/renamed.bin"]);
  expect(held.deleted).toEqual([]);
  expect(await store.list(PREFIX)).toContain(`${PREFIX}/workspace/big.bin`);
  // The held entry stays owned in the manifest, so nothing is orphaned.
  expect(held.manifest.has("workspace/big.bin")).toBe(true);
});

test("segment-glob excludes match exactly one segment per `*` and only the named depth", () => {
  const ex = ["workspaces/*/*/.houston/runtime/"];
  expect(
    excluded(
      "workspaces/Personal/Bob/.houston/runtime/conversations/c1.json",
      ex,
    ),
  ).toBe(true);
  expect(
    excluded("workspaces/Personal/Bob/.houston/runtime/settings.json", ex),
  ).toBe(true);
  // A user project's own .houston/runtime is NOT the agent's — hydrated.
  expect(
    excluded("workspaces/Personal/Bob/repo/.houston/runtime/state.db", ex),
  ).toBe(false);
  expect(
    excluded("workspaces/Personal/Bob/.houston/routines/routines.json", ex),
  ).toBe(false);
  expect(excluded("workspace/.houston/runtime/x", ex)).toBe(false);
});

test("an object deleted between the listing and its download is skipped, not fatal", async () => {
  const { storeRoot, store, work } = setup();
  seed(storeRoot, "agent-1", {
    "workspace/keep.txt": "keep",
    "workspace/vanishes.txt": "gone",
  });
  const listing = await store.list("agent-1");
  rmSync(join(storeRoot, "agent-1", "workspace", "vanishes.txt"));
  // The stale listing still names the deleted object — the boot-gating pass
  // must treat the vanish as a delete, not fail the whole hydration.
  const stale: ObjectStore = {
    list: async () => listing,
    download: (key, dest) => store.download(key, dest),
    upload: (src, key) => store.upload(src, key),
    delete: (key) => store.delete(key),
  };

  const manifest = await hydrate(stale, "agent-1", work);

  expect([...manifest.keys()]).toEqual(["workspace/keep.txt"]);
  expect(readFileSync(join(work, "workspace", "keep.txt"), "utf8")).toBe(
    "keep",
  );
  // Nothing half-fetched survives to be mistaken for a fresh local write.
  expect(existsSync(join(work, "workspace", "vanishes.txt"))).toBe(false);
});
