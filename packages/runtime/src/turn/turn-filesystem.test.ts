import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { claimedTurnIncludes, prepareTurnFilesystem } from "./turn-filesystem";
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
    mkdirSync(join(runtime, "conversations"), { recursive: true });
    writeFileSync(join(runtime, "conversations", `${id}.json`), "{}");
    writeFileSync(join(runtime, "sessions", id, "s.jsonl"), "");
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
    "workspaces/Personal/Bob/.houston/runtime/sessions/c1/s.jsonl",
    "workspaces/Personal/Bob/.houston/runtime/settings.json",
  ]);
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
  expect(include(`${claude}/statsig/cache.json`)).toBe(false);
  expect(include(`${claude}/history.jsonl`)).toBe(false);
  expect(include(`${claude}/.credentials.json`)).toBe(false);
  expect(include("data/sessions/c2/claude/projects/slug/session.jsonl")).toBe(
    false,
  );
});
