import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "./clamped-fs";

/**
 * Gate #1 tool-level wall: drive pi's REAL tool implementations through the
 * clamped definitions and prove every escape shape fails while normal
 * workspace operations keep working. grep/find escapes must throw BEFORE any
 * rg/fd subprocess is spawned on the hostile path.
 */

const base = mkdtempSync(join(tmpdir(), "houston-clamp-"));
const ws = join(base, "workspace");
mkdirSync(ws);
writeFileSync(join(ws, "hello.txt"), "hello from the workspace");
mkdirSync(join(ws, "docs"));
// The crown jewel an injected agent goes for: a credential OUTSIDE the workspace.
writeFileSync(join(base, "auth.json"), JSON.stringify({ access: "SECRET" }));

const tools = new Map(makeClampedFileTools(ws).map((t) => [t.name, t]));
const exec = (name: string, params: Record<string, unknown>) =>
  tools.get(name)!.execute("call-1", params as never, undefined, undefined, {} as never);

test("all six file tools are produced with the builtin-shadowing names", () => {
  expect([...tools.keys()].sort()).toEqual([...CLAMPED_FILE_TOOL_NAMES].sort());
});

test("read: normal workspace read works through pi's real implementation", async () => {
  const result = await exec("read", { path: "hello.txt" });
  expect(JSON.stringify(result.content)).toContain("hello from the workspace");
});

test("read: absolute, traversal, and sibling-credential paths all throw", async () => {
  await expect(exec("read", { path: "/etc/passwd" })).rejects.toThrow("outside the agent workspace");
  await expect(exec("read", { path: "../auth.json" })).rejects.toThrow("outside the agent workspace");
  await expect(exec("read", { path: join(base, "auth.json") })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("write: creates files inside, throws outside", async () => {
  await exec("write", { path: "docs/new.txt", content: "fresh" });
  expect(readFileSync(join(ws, "docs", "new.txt"), "utf8")).toBe("fresh");
  await expect(exec("write", { path: "/tmp/houston-escape.txt", content: "x" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("write", { path: "../escape.txt", content: "x" })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("edit: applies real edits inside, throws outside", async () => {
  writeFileSync(join(ws, "editable.txt"), "alpha beta gamma");
  await exec("edit", {
    path: "editable.txt",
    edits: [{ oldText: "beta", newText: "BETA" }],
  });
  expect(readFileSync(join(ws, "editable.txt"), "utf8")).toBe("alpha BETA gamma");
  await expect(
    exec("edit", { path: "../auth.json", edits: [{ oldText: "SECRET", newText: "owned" }] }),
  ).rejects.toThrow("outside the agent workspace");
});

test("ls: lists the workspace by default, throws outside", async () => {
  const result = await exec("ls", {});
  expect(JSON.stringify(result.content)).toContain("hello.txt");
  await expect(exec("ls", { path: "/" })).rejects.toThrow("outside the agent workspace");
  await expect(exec("ls", { path: ".." })).rejects.toThrow("outside the agent workspace");
});

test("grep: hostile search path throws before any rg spawn", async () => {
  await expect(exec("grep", { pattern: "root", path: "/etc" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("grep", { pattern: "access", path: "../" })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("find: hostile search path throws before any fd spawn", async () => {
  await expect(exec("find", { pattern: "*.json", path: "/" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("find", { pattern: "auth*", path: ".." })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("non-string path is rejected, not coerced", async () => {
  await expect(exec("read", { path: 42 })).rejects.toThrow("'path' must be a string");
});
