import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { awaitDeferredNeed } from "./turn-deferred-files";
import { createDeferredGate } from "./turn-deferred-gate";
import { deferredNeed } from "./turn-deferred-tools";
import { TurnSetupError } from "./turn-layout";

const AGENT = "workspaces/Personal/Bob";
const LONG = 60_000;

function settle() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  listed: string[] = [`${AGENT}/docs/a.md`, `${AGENT}/docs/b.md`],
) {
  const storeRoot = mkdtempSync(join(tmpdir(), "deferred-gate-"));
  const workspaceDir = join(storeRoot, ...AGENT.split("/"));
  mkdirSync(workspaceDir, { recursive: true });
  const gate = createDeferredGate(storeRoot);
  const ready = settle();
  const prioritized: string[] = [];
  const manifest = new Map<string, unknown>();
  gate.observe(ready.promise, {
    prioritize: (rels) => prioritized.push(...rels),
    manifest,
  });
  const land = (rel: string, body = rel) => {
    const path = join(storeRoot, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
    manifest.set(rel, {});
    gate.hooks.onDeferredSettled(rel);
  };
  const missing = (rel: string) => gate.hooks.onDeferredSettled(rel);
  return {
    storeRoot,
    workspaceDir,
    gate,
    ready,
    prioritized,
    land,
    missing,
    manifest,
    listed,
  };
}

function tool(
  t: ReturnType<typeof setup>,
  name: string,
  input: unknown,
): Promise<"ran"> {
  return awaitDeferredNeed(
    t.gate,
    deferredNeed(name, input, t.workspaceDir),
  ).then(() => "ran" as const);
}

async function pending(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const winner = await Promise.race([
    promise.then(
      () => undefined,
      () => undefined,
    ),
    new Promise((resolve) => setTimeout(() => resolve(marker), 10)),
  ]);
  return winner === marker;
}

test("a tool naming no path never waits, even while the files load", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  expect(await tool(t, "WebSearch", { query: "x" })).toBe("ran");
  expect(await tool(t, "mcp__houston__integration_execute", {})).toBe("ran");
  expect(await tool(t, "ask_user", {})).toBe("ran");
});

test("a named path that already landed runs at once", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  t.land(`${AGENT}/docs/a.md`);
  expect(await tool(t, "Read", { file_path: "docs/a.md" })).toBe("ran");
  expect(await tool(t, "read", { path: "CLAUDE.md" })).toBe("ran");
});

test("a named deferred path waits only for itself, and is fetched first", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  const reading = tool(t, "Read", { file_path: "docs/b.md" });
  expect(await pending(reading)).toBe(true);
  expect(t.prioritized).toEqual([`${AGENT}/docs/b.md`]);
  t.land(`${AGENT}/docs/b.md`);
  expect(await reading).toBe("ran");
  expect(await pending(tool(t, "Read", { file_path: "docs/a.md" }))).toBe(true);
});

test("a search waits for what is still loading under its folder", async () => {
  const t = setup([`${AGENT}/docs/a.md`, `${AGENT}/notes/n.md`]);
  t.gate.hooks.onDeferredListed(t.listed);
  const globbing = tool(t, "Glob", { pattern: "docs/**/*.md" });
  expect(await tool(t, "Grep", { pattern: "x", path: "reports" })).toBe("ran");
  expect(await pending(globbing)).toBe(true);
  t.land(`${AGENT}/docs/a.md`);
  expect(await globbing).toBe("ran");
});

test("a new file in an agent folder waits for the listing, never the download", async () => {
  const t = setup();
  const writing = tool(t, "Write", { file_path: "docs/new.md" });
  expect(await pending(writing)).toBe(true);
  t.gate.hooks.onDeferredListed(t.listed);
  expect(await writing).toBe("ran");
});

test("a shell command waits for the whole set, bounded", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  await expect(t.gate.waitForAll(undefined, 20)).rejects.toThrow(
    /still loading.*Try the command again/,
  );
  const running = tool(t, "Bash", { command: "ls" });
  expect(await pending(running)).toBe(true);
  t.ready.resolve();
  expect(await running).toBe("ran");
});

test("files over the budget refuse only the tools that need them", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  t.ready.reject(new TurnSetupError("hydrate_over_cap", "too big"));
  const refused = tool(t, "Read", { file_path: "docs/a.md" });
  await expect(refused).rejects.toThrow(
    /not available in this conversation.*docs\/a\.md.*Continue without them/,
  );
  await expect(refused).rejects.not.toThrow(/again/);
  expect(await tool(t, "Write", { file_path: "docs/new.md" })).toBe("ran");
  expect(await tool(t, "WebFetch", { url: "https://x.test" })).toBe("ran");
  await expect(
    tool(t, "bash", { command: "python report.py" }),
  ).rejects.toThrow(
    /Some of the agent's files could not be loaded.*larger than one conversation.*Run the command again/,
  );
  expect(await tool(t, "bash", { command: "python report.py" })).toBe("ran");
});

test("a failed download names the files it could not load", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  t.land(`${AGENT}/docs/a.md`);
  const waiting = tool(t, "Edit", { file_path: "docs/b.md" });
  t.ready.reject(new Error("store unreachable"));
  await expect(waiting).rejects.toThrow(
    /could not be loaded.*store unreachable.*docs\/b\.md/,
  );
  await expect(waiting).rejects.not.toThrow(/send/);
  expect(await tool(t, "Read", { file_path: "docs/a.md" })).toBe("ran");
});

test("a failure before the listing refuses shell commands and folder paths only", async () => {
  const t = setup();
  t.ready.reject(new Error("listing timed out"));
  await expect(tool(t, "Bash", { command: "ls" })).rejects.toThrow(
    /could not be loaded.*listing timed out/,
  );
  await expect(tool(t, "Read", { file_path: "docs/a.md" })).rejects.toThrow(
    /could not be loaded/,
  );
  expect(await tool(t, "Read", { file_path: "/etc/hosts" })).toBe("ran");
  expect(await tool(t, "WebSearch", { query: "x" })).toBe("ran");
});

test("a stopped turn releases its waiting tool", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  const abort = new AbortController();
  const waiting = t.gate.waitForPaths(
    [join(t.workspaceDir, "docs", "a.md")],
    abort.signal,
    LONG,
  );
  abort.abort();
  await expect(waiting).rejects.toThrow(/stopped/);
});

test("the before-snapshot keeps landed files as they landed, so a tool's edit reads as modified", async () => {
  const t = setup();
  t.gate.hooks.onDeferredListed(t.listed);
  writeFileSync(join(t.workspaceDir, "notes.md"), "notes");
  const before = t.gate.beforeSnapshot(t.workspaceDir);
  const editing = tool(t, "Edit", { file_path: "docs/a.md" });
  t.land(`${AGENT}/docs/a.md`, "a");
  await editing;
  writeFileSync(join(t.workspaceDir, "docs", "a.md"), "edited by the tool");
  writeFileSync(join(t.workspaceDir, "report.md"), "made by the tool");
  t.land(`${AGENT}/docs/b.md`, "b");
  t.ready.resolve();
  const snapshot = await before;
  expect(snapshot?.get("docs/a.md")?.size).toBe(1);
  expect(snapshot?.has("docs/b.md")).toBe(true);
  expect(snapshot?.has("notes.md")).toBe(true);
  expect(snapshot?.has("report.md")).toBe(false);
});

test("after a failure sync leaves out only deferred files the turn never owned", async () => {
  const t = setup([
    `${AGENT}/docs/a.md`,
    `${AGENT}/docs/b.md`,
    `${AGENT}/docs/gone.md`,
    `${AGENT}/docs/late.md`,
  ]);
  t.gate.hooks.onDeferredListed(t.listed);
  t.land(`${AGENT}/docs/a.md`);
  t.land(`${AGENT}/docs/late.md`);
  t.missing(`${AGENT}/docs/gone.md`);
  expect(t.gate.unsynced(`${AGENT}/docs/b.md`, t.manifest)).toBe(false);
  t.ready.reject(new Error("store unreachable"));
  await t.ready.promise.then(
    () => undefined,
    () => undefined,
  );
  t.manifest.delete(`${AGENT}/docs/late.md`);
  const unsynced = (rel: string) => t.gate.unsynced(rel, t.manifest);
  expect(unsynced(`${AGENT}/docs/b.md`)).toBe(true);
  expect(unsynced(`${AGENT}/docs/late.md`)).toBe(true);
  expect(unsynced(`${AGENT}/docs/a.md`)).toBe(false);
  expect(unsynced(`${AGENT}/docs/gone.md`)).toBe(false);
  expect(unsynced(`${AGENT}/docs/new.md`)).toBe(false);
});
