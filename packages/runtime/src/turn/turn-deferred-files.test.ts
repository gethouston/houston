import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import type { PiBackendDeps } from "../backends/pi/backend";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import {
  awaitDeferredFiles,
  deferredWorkspaceFile,
  gateTurnTools,
  snapshotWhenReady,
} from "./turn-deferred-files";
import { syncTurnFilesystem } from "./turn-filesystem";

type TurnTool = PiBackendDeps["customTools"][number];

function deferred() {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeTool(run: () => void): TurnTool {
  return {
    name: "write",
    execute: async () => {
      run();
      return { content: [], details: undefined };
    },
  } as unknown as TurnTool;
}

function callTool(tool: TurnTool, signal?: AbortSignal) {
  return tool.execute("call-1", {} as never, signal, undefined, {} as never);
}

test("files in the agent's folders other than the startup ones are deferred", () => {
  const f = deferredWorkspaceFile;
  expect(f("workspaces/Personal/Bob/uploads/a.png")).toBe(true);
  expect(f("workspaces/Personal/Bob/uploads/docs/a.md")).toBe(true);
  expect(f("workspaces/Personal/Bob/reports/q3.xlsx")).toBe(true);
  expect(f("workspaces/Personal/Bob/notes/uploads/a.md")).toBe(true);
  expect(f("workspaces/Personal/Bob/skills/a/SKILL.md")).toBe(true);
  expect(f("workspaces/Personal/Bob/reports/.x.md")).toBe(true);
  expect(f("workspaces/Personal/Bob/Contratación/oferta.pdf")).toBe(true);
  expect(f("workspaces/Personal/Bob/.repo-web/.git/objects/ab/cd")).toBe(true);
  expect(f("workspaces/Personal/Bob/.git/HEAD")).toBe(true);
  expect(f("workspaces/Personal/Bob/.venv/bin/python")).toBe(true);
  expect(f("workspaces/Personal/Bob/.cache/pip/a")).toBe(true);
});

test("runtime inputs stay on the prompt's critical path", () => {
  const f = deferredWorkspaceFile;
  expect(f("workspaces/Personal/Bob/CLAUDE.md")).toBe(false);
  expect(f("workspaces/Personal/Bob/AGENTS.md")).toBe(false);
  expect(f("workspaces/Personal/Bob/notes.md")).toBe(false);
  expect(f("workspaces/Personal/Bob/.houston/runtime/a")).toBe(false);
  expect(f("workspaces/Personal/Bob/.houston/state/seen.json")).toBe(false);
  expect(f("workspaces/Personal/Bob/.agents/skills/a/SKILL.md")).toBe(false);
  expect(f("workspaces/Personal/Bob/.claude/settings.json")).toBe(false);
  expect(f("workspaces/Personal/Bob/.pi/settings.json")).toBe(false);
  expect(f("workspaces/Personal/GROUP.md")).toBe(false);
  expect(f("workspaces/Personal/Bob/uploads")).toBe(false);
  expect(f("workspaces/Personal/Bob//a.md")).toBe(false);
  expect(f("data/uploads/a.png")).toBe(false);
  expect(f("claude-login/projects/a.jsonl")).toBe(false);
});

test("a claimed turn is hydrated before its files land, and syncs after them", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "deferred-store-"));
  const prefix = "ws/w1/agent-1";
  const agent = join(storeRoot, prefix, "workspaces", "Personal", "Bob");
  mkdirSync(join(agent, ".houston", "runtime", "conversations"), {
    recursive: true,
  });
  mkdirSync(join(agent, "uploads"), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, "uploads", "photo.png"), "png");
  writeFileSync(join(agent, ".houston", "runtime", "settings.json"), "{}");
  const inner = new LocalDirStore(storeRoot);
  const landing = deferred();
  const gated: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: async (key, destination, options) => {
      if (key.endsWith("/uploads/photo.png")) await landing.promise;
      await inner.download(key, destination, options);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };

  const preparation = await startTurnRequestFilesystem({
    store: gated,
    prefix,
    root: mkdtempSync(join(tmpdir(), "deferred-root-")),
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
  const fs = await preparation.hydrated;
  const photo = join(fs.workspaceDir, "uploads", "photo.png");
  expect(existsSync(join(fs.workspaceDir, "CLAUDE.md"))).toBe(true);
  expect(existsSync(photo)).toBe(false);
  expect(fs.workspaceReady).toBeDefined();

  const sync = syncTurnFilesystem({
    store: inner,
    prefix,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  let syncFinished = false;
  void sync.then(() => {
    syncFinished = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(syncFinished).toBe(false);
  landing.resolve();
  await fs.workspaceReady;
  expect(existsSync(photo)).toBe(true);
  const synced = await sync;
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
  expect(await preparation.settled).toMatchObject({ ok: true });
});

test("a gated tool runs only once the deferred files land", async () => {
  const ready = deferred();
  let ran = false;
  const [tool] = gateTurnTools(
    [
      fakeTool(() => {
        ran = true;
      }),
    ],
    ready.promise,
  );
  if (!tool) throw new Error("gate dropped the tool");
  const call = callTool(tool);
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(ran).toBe(false);
  ready.resolve();
  await call;
  expect(ran).toBe(true);
});

test("a failed or stopped deferred hydration refuses the tool", async () => {
  const failed = deferred();
  const [tool] = gateTurnTools([fakeTool(() => undefined)], failed.promise);
  if (!tool) throw new Error("gate dropped the tool");
  failed.reject(new Error("store unreachable"));
  await expect(callTool(tool)).rejects.toThrow(/store unreachable/);

  const pending = deferred();
  const abort = new AbortController();
  const waiting = awaitDeferredFiles(pending.promise, abort.signal);
  abort.abort();
  await expect(waiting).rejects.toThrow(/stopped/);
});

test("the file-change snapshot sees landed files but never a tool's write", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "deferred-snapshot-"));
  const ready = deferred();
  const before = snapshotWhenReady(workspace, ready.promise);
  const [tool] = gateTurnTools(
    [fakeTool(() => writeFileSync(join(workspace, "report.md"), "made"))],
    ready.promise,
  );
  if (!tool) throw new Error("gate dropped the tool");
  const call = callTool(tool);
  mkdirSync(join(workspace, "uploads"));
  writeFileSync(join(workspace, "uploads", "photo.png"), "png");
  ready.resolve();
  await call;
  const snapshot = await before;
  expect(snapshot?.has("uploads/photo.png")).toBe(true);
  expect(snapshot?.has("report.md")).toBe(false);
});

test("without deferred objects the snapshot and the tools run at once", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "deferred-none-"));
  writeFileSync(join(workspace, "a.md"), "a");
  const tools = [fakeTool(() => undefined)];
  expect(gateTurnTools(tools, undefined)).toBe(tools);
  expect((await snapshotWhenReady(workspace, undefined))?.has("a.md")).toBe(
    true,
  );
});

test("a gated call leaves no abort listener behind on the shared signal", async () => {
  const abort = new AbortController();
  let listeners = 0;
  const add = abort.signal.addEventListener.bind(abort.signal);
  const remove = abort.signal.removeEventListener.bind(abort.signal);
  abort.signal.addEventListener = ((...args: Parameters<typeof add>) => {
    listeners++;
    add(...args);
  }) as typeof add;
  abort.signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
    listeners--;
    remove(...args);
  }) as typeof remove;
  for (let i = 0; i < 20; i++)
    await awaitDeferredFiles(Promise.resolve(), abort.signal);
  expect(listeners).toBe(0);
});

test("a failed deferral syncs no upload that landed outside the manifest", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "deferred-fail-store-"));
  const prefix = "ws/w1/agent-1";
  const agent = join(storeRoot, prefix, "workspaces", "Personal", "Bob");
  mkdirSync(join(agent, ".houston", "runtime"), { recursive: true });
  mkdirSync(join(agent, "uploads"), { recursive: true });
  writeFileSync(join(agent, "uploads", "landed.png"), "png");
  writeFileSync(join(agent, "uploads", "broken.png"), "png");
  writeFileSync(join(agent, ".houston", "runtime", "settings.json"), "{}");
  const inner = new LocalDirStore(storeRoot);
  const gated: ObjectStore = {
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: async (key, destination, options) => {
      if (key.endsWith("broken.png")) throw new Error("store unreachable");
      await inner.download(key, destination, options);
    },
    upload: (source, key, options) => inner.upload(source, key, options),
    delete: (key, options) => inner.delete(key, options),
  };
  const preparation = await startTurnRequestFilesystem({
    store: gated,
    prefix,
    root: mkdtempSync(join(tmpdir(), "deferred-fail-root-")),
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
  const fs = await preparation.hydrated;
  await expect(fs.workspaceReady).rejects.toThrow(/store unreachable/);
  writeFileSync(join(fs.workspaceDir, "uploads", "landed.png"), "png");
  fs.manifest.delete("workspaces/Personal/Bob/uploads/landed.png");
  const synced = await syncTurnFilesystem({
    store: inner,
    prefix,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(synced.uploaded).toEqual([]);
  expect(synced.deleted).toEqual([]);
});

test("a tool still waiting at the deadline is refused, as on Claude", async () => {
  const never = new Promise<void>(() => undefined);
  await expect(awaitDeferredFiles(never, undefined, 20)).rejects.toThrow(
    /still loading/,
  );
});
