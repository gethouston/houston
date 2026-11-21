import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  ObjectNotFoundError,
  type ObjectStore,
  PrefetchedObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test, vi } from "vitest";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { DeferredFilesAbandonedError } from "./turn-deferred-watch";
import { syncTurnFilesystem } from "./turn-filesystem";

const PREFIX = "ws/w1/agent-1";
const CLAIM = {
  id: "claim-1",
  token: "token-1",
  bootId: "boot-1",
  heartbeatUrl: "https://heartbeat.test",
};

function agentStore() {
  const storeRoot = mkdtempSync(join(tmpdir(), "deferred-scope-store-"));
  const agent = join(storeRoot, PREFIX, "workspaces", "Personal", "Bob");
  for (const dir of [
    [".houston", "runtime"],
    [".agents", "skills", "brief"],
    ["reports"],
    ["uploads"],
  ])
    mkdirSync(join(agent, ...dir), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, "notes.md"), "root note\n");
  writeFileSync(join(agent, ".houston", "runtime", "settings.json"), "{}");
  writeFileSync(join(agent, ".agents", "skills", "brief", "SKILL.md"), "s\n");
  writeFileSync(join(agent, "reports", "q3.md"), "q3 v1\n");
  writeFileSync(join(agent, "reports", "q4.md"), "q4 v1\n");
  writeFileSync(join(agent, "uploads", "photo.png"), "png");
  return { storeRoot, agent, inner: new LocalDirStore(storeRoot) };
}

function gatedStore(
  inner: LocalDirStore,
  hold: (key: string) => Promise<void> | undefined,
): ObjectStore {
  return {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: async (key, destination, options) => {
      await hold(key);
      await inner.download(key, destination, options);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
}

function prepare(store: ObjectStore, timings: Record<string, number> = {}) {
  return startTurnRequestFilesystem({
    store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "deferred-scope-root-")),
    turn: { claim: CLAIM, conversationId: "c1" },
    timings,
  });
}

function stalled(signal?: AbortSignal): Promise<void> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });
}

function syncOf(
  inner: ObjectStore,
  fs: Awaited<ReturnType<typeof prepare>>["filesystem"],
) {
  return syncTurnFilesystem({
    store: inner,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
}

test("the prompt's inputs land before `hydrated`, the person's folders after", async () => {
  const { agent, inner } = agentStore();
  let release: () => void = () => undefined;
  const landing = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = gatedStore(inner, (key) =>
    key.includes("/reports/") || key.includes("/uploads/")
      ? landing
      : undefined,
  );
  const preparation = await prepare(store);
  const fs = await preparation.hydrated;
  const at = (...rel: string[]) => join(fs.workspaceDir, ...rel);
  expect(existsSync(at("CLAUDE.md"))).toBe(true);
  expect(existsSync(at("notes.md"))).toBe(true);
  expect(existsSync(at(".houston", "runtime", "settings.json"))).toBe(true);
  expect(existsSync(at(".agents", "skills", "brief", "SKILL.md"))).toBe(true);
  expect(existsSync(at("reports", "q3.md"))).toBe(false);
  expect(existsSync(at("uploads", "photo.png"))).toBe(false);

  release();
  await fs.workspaceReady;
  writeFileSync(at("reports", "q3.md"), "q3 v2\n");
  writeFileSync(at("reports", "summary.md"), "made by the turn\n");
  const synced = await syncTurnFilesystem({
    store: inner,
    prefix: PREFIX,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded.toSorted()).toEqual([
    "workspaces/Personal/Bob/reports/q3.md",
    "workspaces/Personal/Bob/reports/summary.md",
  ]);
  expect(synced.deleted).toEqual([]);
  expect(readFileSync(join(agent, "reports", "q3.md"), "utf8")).toBe("q3 v2\n");
  expect(await preparation.settled).toMatchObject({ ok: true });
});

test("a failed deferral never deletes or overwrites the person's files", async () => {
  const { agent, inner } = agentStore();
  const store = gatedStore(inner, (key) =>
    key.endsWith("/reports/q4.md")
      ? Promise.reject(new Error("store unreachable"))
      : undefined,
  );
  const preparation = await prepare(store);
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
  expect(readFileSync(join(agent, "reports", "q4.md"), "utf8")).toBe("q4 v1\n");
  expect(await preparation.settled).toMatchObject({ ok: false });
});

test("a prompt that ends before its files land stops the download and syncs nothing of them", async () => {
  const { agent, inner } = agentStore();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const store: ObjectStore = {
    ...gatedStore(inner, () => undefined),
    download: async (key, destination, options) => {
      if (key.includes("/reports/")) await stalled(options?.signal);
      await inner.download(key, destination, options);
    },
  };
  const timings: Record<string, number> = {};
  const preparation = await prepare(store, timings);
  const fs = await preparation.hydrated;
  fs.abandonDeferred?.();
  await expect(fs.workspaceReady).rejects.toBeInstanceOf(
    DeferredFilesAbandonedError,
  );
  const started = performance.now();
  const synced = await syncOf(inner, fs);
  expect(performance.now() - started).toBeLessThan(1_000);
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
  expect(readFileSync(join(agent, "reports", "q3.md"), "utf8")).toBe("q3 v1\n");
  expect(timings.t_files_abandoned).toBeDefined();
  expect(timings.t_files_ready).toBeUndefined();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
});

test("abandoning after the files landed changes nothing", async () => {
  const { inner } = agentStore();
  const timings: Record<string, number> = {};
  const preparation = await prepare(
    gatedStore(inner, () => undefined),
    timings,
  );
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  fs.abandonDeferred?.();
  expect(timings.t_files_ready).toBeDefined();
  expect(await preparation.settled).toMatchObject({ ok: true });
});

test("a failed background download is reported once, with its cause", async () => {
  const { inner } = agentStore();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const timings: Record<string, number> = {};
  const preparation = await prepare(
    gatedStore(inner, (key) =>
      key.endsWith("/uploads/photo.png")
        ? Promise.reject(new Error("store unreachable"))
        : undefined,
    ),
    timings,
  );
  const fs = await preparation.hydrated;
  await expect(fs.workspaceReady).rejects.toThrow(/store unreachable/);
  await syncOf(inner, fs);
  expect(error).toHaveBeenCalledTimes(1);
  expect(String(error.mock.calls[0]?.[0])).toBe(
    "[turn] deferred_files_failed cause=store unreachable",
  );
  expect(timings.t_deferred_failed).toBeDefined();
  error.mockRestore();
});

test("a deferred file deleted since the listing is skipped, not a failure", async () => {
  const { inner } = agentStore();
  const store: ObjectStore = {
    ...gatedStore(inner, () => undefined),
    download: async (key, destination, options) => {
      if (key.endsWith("/reports/q4.md"))
        throw new ObjectNotFoundError(key, "gone");
      await inner.download(key, destination, options);
    },
  };
  const preparation = await prepare(store);
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  expect(existsSync(join(fs.workspaceDir, "reports", "q4.md"))).toBe(false);
  expect(existsSync(join(fs.workspaceDir, "reports", "q3.md"))).toBe(true);
  const synced = await syncOf(inner, fs);
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
});

test("an older gateway's envelope that inlines the deferred files serves them from memory", async () => {
  const { inner } = agentStore();
  const manifest = await inner.manifest(PREFIX);
  const objects = new Map<string, { data: Buffer }>();
  for (const { key } of manifest) {
    const file = join(mkdtempSync(join(tmpdir(), "inline-")), "f");
    await inner.download(key, file);
    objects.set(key, { data: readFileSync(file) });
  }
  const store = new PrefetchedObjectStore(
    gatedStore(inner, (key) =>
      Promise.reject(new Error(`read the store for ${key}`)),
    ),
    { manifest, objects },
  );
  const preparation = await prepare(store);
  const fs = await preparation.hydrated;
  await fs.workspaceReady;
  expect(readFileSync(join(fs.workspaceDir, "reports", "q3.md"), "utf8")).toBe(
    "q3 v1\n",
  );
  expect(existsSync(join(fs.workspaceDir, "uploads", "photo.png"))).toBe(true);
  const synced = await syncOf(inner, fs);
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
});
