import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalDirStore,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { createSessionsStore } from "../backends/claude/sessions-store";
import { resumeSessionManager } from "../backends/pi/backend";
import {
  claimedTurnIncludes,
  prepareTurnFilesystem,
  syncTurnFilesystem,
} from "./turn-filesystem";
import { ownConversationOnly } from "./turn-hot-set";

test("route-op excludes skip the runtime tree wherever the agent sits", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-hydrate-"));
  const prefix = "ws/w1/agent-1";
  const agent = join(storeRoot, prefix, "workspaces", "Personal", "Bob");
  mkdirSync(join(agent, ".houston", "runtime", "conversations"), {
    recursive: true,
  });
  mkdirSync(join(agent, ".houston", "routines"), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, "report.csv"), "a,b\n");
  writeFileSync(join(agent, ".houston", "routines", "routines.json"), "[]");
  writeFileSync(
    join(agent, ".houston", "runtime", "conversations", "c1.json"),
    "{}",
  );
  writeFileSync(join(agent, ".houston", "runtime", "settings.json"), "{}");

  const root = mkdtempSync(join(tmpdir(), "op-root-"));
  const fs = await prepareTurnFilesystem({
    store: new LocalDirStore(storeRoot),
    prefix,
    root,
    claimed: true,
    excludes: ["workspaces/*/*/.houston/runtime/"],
  });
  const hydrated = JSON.stringify([...fs.manifest.keys()].sort());
  expect(hydrated).toContain("report.csv");
  expect(hydrated).toContain("routines.json");
  expect(hydrated).not.toContain("runtime/conversations/c1.json");
  expect(hydrated).not.toContain("runtime/settings.json");
  expect(
    existsSync(
      join(fs.workspaceDir, ".houston", "runtime", "conversations", "c1.json"),
    ),
  ).toBe(false);
  expect(existsSync(join(fs.workspaceDir, "report.csv"))).toBe(true);
});

test("a lazy prepare downloads nothing, lays out the agent skeleton, and reads on demand", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "lazy-hydrate-"));
  const prefix = "ws/w1/agent-1";
  const agent = join(storeRoot, prefix, "workspaces", "Personal", "Bob");
  mkdirSync(join(agent, ".houston", "routines"), { recursive: true });
  mkdirSync(join(agent, "files"), { recursive: true });
  writeFileSync(join(agent, "CLAUDE.md"), "# Bob\n");
  writeFileSync(join(agent, "files", "report.csv"), "a,b\n");
  writeFileSync(join(agent, ".houston", "routines", "routines.json"), "[]");
  const inner = new LocalDirStore(storeRoot);
  const downloads: string[] = [];
  const store = {
    list: (p: string) => inner.list(p),
    manifest: (p?: string) => inner.manifest(p),
    download: (key: string, dest: string) => {
      downloads.push(key);
      return inner.download(key, dest);
    },
    upload: inner.upload.bind(inner),
    delete: inner.delete.bind(inner),
  };
  const root = mkdtempSync(join(tmpdir(), "lazy-root-"));
  const fs = await prepareTurnFilesystem({
    store,
    prefix,
    root,
    claimed: true,
    lazy: true,
  });
  expect(fs.kind).toBe("standing");
  expect(fs.workspaceRel).toBe("workspaces/Personal/Bob");
  expect(downloads).toEqual([]);
  expect(fs.manifest.size).toBe(0);
  expect(fs.listedObjects).toBe(3);
  expect(existsSync(join(fs.workspaceDir, "CLAUDE.md"))).toBe(false);
  expect(await fs.vfs.readText("workspaces/Personal/Bob/CLAUDE.md")).toBe(
    "# Bob\n",
  );
  expect(downloads).toEqual([`${prefix}/workspaces/Personal/Bob/CLAUDE.md`]);
  expect(fs.manifest.size).toBe(1);
});

test("a claimed turn's filter leaves other conversations' history out of the hydrate", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "hot-set-hydrate-"));
  const prefix = "ws/w1/agent-1";
  const runtime = join(
    storeRoot,
    prefix,
    "workspaces",
    "Personal",
    "Bob",
    ".houston",
    "runtime",
  );
  for (const id of ["c1", "c2"]) {
    mkdirSync(join(runtime, "sessions", id), { recursive: true });
    mkdirSync(join(runtime, "sessions", id, "claude"), { recursive: true });
    mkdirSync(join(runtime, "conversations"), { recursive: true });
    writeFileSync(join(runtime, "conversations", `${id}.json`), "{}");
    writeFileSync(join(runtime, "sessions", id, "s.jsonl"), "");
    writeFileSync(
      join(runtime, "sessions", id, "claude", "sessions.json"),
      "{}",
    );
  }
  writeFileSync(join(runtime, "settings.json"), "{}");
  const fs = await prepareTurnFilesystem({
    store: new LocalDirStore(storeRoot),
    prefix,
    root: mkdtempSync(join(tmpdir(), "hot-set-root-")),
    claimed: true,
    filter: ownConversationOnly("c1"),
  });
  const keys = [...fs.manifest.keys()].sort();
  expect(keys).toEqual([
    "workspaces/Personal/Bob/.houston/runtime/conversations/c1.json",
    "workspaces/Personal/Bob/.houston/runtime/sessions/c1/claude/sessions.json",
    "workspaces/Personal/Bob/.houston/runtime/sessions/c1/s.jsonl",
    "workspaces/Personal/Bob/.houston/runtime/settings.json",
  ]);
});

test("a claimed turn hydrates live session tails and leaves skips untouched", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "session-diet-store-"));
  const prefix = "ws/w1/agent-1";
  const agentRel = "workspaces/Personal/Bob";
  const runtimeRel = `${agentRel}/.houston/runtime`;
  const sessionRel = `${runtimeRel}/sessions/c1`;
  const root = join(storeRoot, prefix);
  const seed = (rel: string, content: string) => {
    const file = join(root, ...rel.split("/"));
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  seed(`${agentRel}/note.txt`, "workspace stays eager");
  seed(`${runtimeRel}/settings.json`, "{}");
  seed(`${runtimeRel}/conversations/c1.json`, "{}");
  const piOld = `${sessionRel}/2026-08-20T19-00-01-250Z_old.jsonl`;
  const piReadable = `${sessionRel}/2026-08-21T19-00-01-250Z_readable.jsonl`;
  const piCorrupt = `${sessionRel}/2026-08-22T19-00-01-250Z_torn.jsonl`;
  const piSession = (id: string) =>
    `${JSON.stringify({
      type: "session",
      version: 3,
      id,
      timestamp: "2026-08-20T19:00:01.250Z",
      cwd: "/previous/turn/workspace",
    })}\n`;
  seed(piOld, piSession("old"));
  const piReadableFile = seed(piReadable, piSession("readable"));
  seed(piCorrupt, "not json\n");
  const unexpectedSibling = `${sessionRel}/session.lock`;
  seed(unexpectedSibling, "stale lock");
  seed(`${sessionRel}/harness.json`, '{"backend":"claude"}');
  seed(`${sessionRel}/claude/sessions.json`, '{"c1":"session-new"}');
  const claudeOld = `${sessionRel}/claude/projects/old/session-old.jsonl`;
  const claudeNew = `${sessionRel}/claude/projects/foreign/session-new.jsonl`;
  const claudeOldFile = seed(claudeOld, "old claude");
  const claudeNewFile = seed(claudeNew, "new claude");
  seed(`${sessionRel}/claude/statsig/cache.json`, "cache");
  utimesSync(piReadableFile, new Date(1_000), new Date(1_000));
  // The relocated stale session uploaded after the fresh retry. Its newer
  // store timestamp must not outrank the sessions.json pointer.
  utimesSync(claudeOldFile, new Date(2_000), new Date(2_000));
  utimesSync(claudeNewFile, new Date(1_000), new Date(1_000));

  const inner = new LocalDirStore(storeRoot);
  const uploads: string[] = [];
  const deletes: string[] = [];
  const store: ObjectStore = {
    list: (scope) => inner.list(scope),
    manifest: (scope) => inner.manifest(scope),
    download: (key, dest, options) => inner.download(key, dest, options),
    upload: async (source, key, options) => {
      uploads.push(key);
      return inner.upload(source, key, options);
    },
    delete: async (key, options) => {
      deletes.push(key);
      return inner.delete(key, options);
    },
  };
  const fs = await prepareTurnFilesystem({
    store,
    prefix,
    root: mkdtempSync(join(tmpdir(), "session-diet-root-")),
    claimed: true,
    filter: ownConversationOnly("c1"),
  });

  expect([...fs.manifest.keys()]).toContain(piReadable);
  expect([...fs.manifest.keys()]).toContain(piCorrupt);
  expect([...fs.manifest.keys()]).toContain(claudeNew);
  expect([...fs.manifest.keys()]).not.toContain(piOld);
  expect([...fs.manifest.keys()]).not.toContain(claudeOld);
  expect(fs.skippedObjects).toBe(4);
  expect(existsSync(join(fs.storeRoot, ...piOld.split("/")))).toBe(false);
  expect(existsSync(join(fs.storeRoot, ...claudeOld.split("/")))).toBe(false);
  expect(existsSync(join(fs.storeRoot, ...unexpectedSibling.split("/")))).toBe(
    false,
  );
  expect(
    resumeSessionManager(
      fs.workspaceDir,
      join(fs.dataDir, "sessions", "c1"),
      false,
    ).getSessionFile(),
  ).toBe(join(fs.storeRoot, ...piReadable.split("/")));

  const configDir = join(fs.dataDir, "sessions", "c1", "claude");
  const sessions = createSessionsStore({
    configDir,
    sessionsFile: join(configDir, "sessions.json"),
    cwd: fs.workspaceDir,
  });
  expect(sessions.resolveResume("c1")).toBe("session-new");

  await syncTurnFilesystem({
    store,
    prefix,
    filesystem: fs,
    conversationId: "c1",
    claimed: true,
  });
  expect(uploads.some((key) => key.endsWith(`/${piOld}`))).toBe(false);
  expect(uploads.some((key) => key.endsWith(`/${claudeOld}`))).toBe(false);
  expect(deletes.some((key) => key.endsWith(`/${piOld}`))).toBe(false);
  expect(deletes.some((key) => key.endsWith(`/${claudeOld}`))).toBe(false);
  expect(await inner.list(prefix)).toContain(`${prefix}/${piOld}`);
  expect(await inner.list(prefix)).toContain(`${prefix}/${claudeOld}`);
  expect(await inner.list(prefix)).toContain(`${prefix}/${unexpectedSibling}`);
});

test("a claimed turn whose agent holds only other conversations still resolves its layout", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "hot-set-empty-"));
  const prefix = "ws/w1/agent-1";
  const runtime = join(
    storeRoot,
    prefix,
    "workspaces",
    "Personal",
    "Bob",
    ".houston",
    "runtime",
  );
  mkdirSync(join(runtime, "conversations"), { recursive: true });
  writeFileSync(join(runtime, "conversations", "c2.json"), "{}");
  const fs = await prepareTurnFilesystem({
    store: new LocalDirStore(storeRoot),
    prefix,
    root: mkdtempSync(join(tmpdir(), "hot-set-empty-root-")),
    claimed: true,
    filter: ownConversationOnly("c-new"),
  });
  expect(fs.manifest.size).toBe(0);
  expect(fs.kind).toBe("standing");
  expect(fs.workspaceRel).toBe("workspaces/Personal/Bob");
  expect(fs.listedObjects).toBe(1);
});

test("the eager path reports the store's generation capability even when the filtered manifest is empty", async () => {
  const storeRoot = mkdtempSync(join(tmpdir(), "gen-aware-"));
  const prefix = "ws/w1/agent-1";
  const runtime = join(
    storeRoot,
    prefix,
    "workspaces/Personal/Bob/.houston/runtime",
  );
  mkdirSync(join(runtime, "conversations"), { recursive: true });
  writeFileSync(join(runtime, "conversations", "c2.json"), "{}");
  const inner = new LocalDirStore(storeRoot);
  const store = {
    list: (p: string) => inner.list(p),
    manifest: async (p?: string) =>
      (await inner.manifest(p)).map((o) => ({ ...o, generation: "3" })),
    download: inner.download.bind(inner),
    upload: inner.upload.bind(inner),
    delete: inner.delete.bind(inner),
  };
  const fs = await prepareTurnFilesystem({
    store,
    prefix,
    root: mkdtempSync(join(tmpdir(), "gen-aware-root-")),
    claimed: true,
    filter: ownConversationOnly("c-new"),
  });
  expect(fs.manifest.size).toBe(0);
  expect(fs.generationAware).toBe(true);
  const plain = await prepareTurnFilesystem({
    store: inner,
    prefix,
    root: mkdtempSync(join(tmpdir(), "gen-aware-root2-")),
    claimed: true,
  });
  expect(plain.generationAware).toBe(false);
});

test("a claim syncs only durable Claude conversation state", () => {
  const include = claimedTurnIncludes("data", "workspace", "c1");
  const claude = "data/sessions/c1/claude";

  expect(include(`${claude}/projects/slug/session.jsonl`)).toBe(true);
  expect(include(`${claude}/sessions.json`)).toBe(true);
  expect(include("data/sessions/c1/harness.json")).toBe(true);
  expect(include(`${claude}/statsig/cache.json`)).toBe(false);
  expect(include(`${claude}/history.jsonl`)).toBe(false);
  expect(include(`${claude}/.credentials.json`)).toBe(false);
  expect(include("data/sessions/c2/claude/projects/slug/session.jsonl")).toBe(
    false,
  );
});
