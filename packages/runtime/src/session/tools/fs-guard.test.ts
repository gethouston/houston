import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PathEscapeError, WorkspaceGuard } from "./fs-guard";

/**
 * Gate #1 unit wall: every path shape a prompt-injected model could supply to
 * a file tool must either resolve inside the workspace or throw. These mirror
 * the exact resolution pi's resolveToCwd applies (absolute, ~, @-prefix,
 * file:// URL, unicode spaces) — each one is a real bypass if unguarded.
 */

function freshRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "houston-guard-"));
  writeFileSync(join(root, "notes.txt"), "in-workspace");
  mkdirSync(join(root, "sub"));
  return root;
}

const root = freshRoot();
const guard = new WorkspaceGuard(root);

test("relative path resolves inside the workspace", () => {
  expect(guard.clamp("notes.txt")).toBe(join(guard.root, "notes.txt"));
});

test("undefined defaults to the workspace root (ls/grep/find default)", () => {
  expect(guard.clamp(undefined)).toBe(guard.root);
});

test("'..' that stays inside is allowed; '..' that escapes throws", () => {
  expect(guard.clamp("sub/../notes.txt")).toBe(join(guard.root, "notes.txt"));
  expect(() => guard.clamp("../somewhere")).toThrow(PathEscapeError);
  expect(() => guard.clamp("sub/../../../etc/passwd")).toThrow(PathEscapeError);
});

test("absolute path outside the workspace throws", () => {
  expect(() => guard.clamp("/etc/passwd")).toThrow(PathEscapeError);
});

test("absolute path inside the workspace is allowed", () => {
  expect(guard.clamp(join(guard.root, "notes.txt"))).toBe(
    join(guard.root, "notes.txt"),
  );
});

test("~ and ~/ expand to the home dir and throw", () => {
  expect(() => guard.clamp("~")).toThrow(PathEscapeError);
  expect(() => guard.clamp("~/.ssh/id_rsa")).toThrow(PathEscapeError);
});

test("@-prefixed absolute path (pi strips the @) throws", () => {
  // pi's normalizePath strips a leading @, turning "@/etc/passwd" into
  // "/etc/passwd" — a guard that misses this rule would let it through.
  expect(() => guard.clamp("@/etc/passwd")).toThrow(PathEscapeError);
});

test("file:// URL to an outside path throws", () => {
  expect(() => guard.clamp("file:///etc/passwd")).toThrow(PathEscapeError);
});

test("not-yet-existing nested path inside the workspace is allowed (write/mkdir)", () => {
  expect(guard.clamp("new/deep/file.txt")).toBe(
    join(guard.root, "new", "deep", "file.txt"),
  );
});

test("symlinked FILE pointing outside the workspace throws", () => {
  const r = freshRoot();
  const g = new WorkspaceGuard(r);
  const outside = mkdtempSync(join(tmpdir(), "houston-outside-"));
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(join(outside, "secret.txt"), join(r, "innocent.txt"));
  expect(() => g.clamp("innocent.txt")).toThrow(PathEscapeError);
});

test("symlinked DIRECTORY pointing outside the workspace throws", () => {
  const r = freshRoot();
  const g = new WorkspaceGuard(r);
  const outside = mkdtempSync(join(tmpdir(), "houston-outside-"));
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(r, "evil-dir"));
  expect(() => g.clamp("evil-dir/secret.txt")).toThrow(PathEscapeError);
  // Even a file that does not exist yet under the symlinked dir must throw,
  // or `write` could drop files outside the workspace.
  expect(() => g.clamp("evil-dir/new-file.txt")).toThrow(PathEscapeError);
});

test("a sibling data dir (auth.json) is unreachable from the workspace", () => {
  // Layout mirrors the cloud sandbox: <base>/workspace + <base>/auth.json.
  const base = mkdtempSync(join(tmpdir(), "houston-data-"));
  const ws = join(base, "workspace");
  mkdirSync(ws);
  writeFileSync(join(base, "auth.json"), '{"secret":true}');
  const g = new WorkspaceGuard(ws);
  expect(() => g.clamp("../auth.json")).toThrow(PathEscapeError);
  expect(() => g.clamp(join(base, "auth.json"))).toThrow(PathEscapeError);
});

test("assertInside guards pi-resolved absolute paths (inner wall)", () => {
  expect(guard.assertInside(join(guard.root, "notes.txt"))).toBe(
    join(guard.root, "notes.txt"),
  );
  expect(() => guard.assertInside("/etc/passwd")).toThrow(PathEscapeError);
  expect(() => guard.assertInside(resolve(homedir(), ".ssh"))).toThrow(
    PathEscapeError,
  );
});

test("guard root is canonical even when the configured root holds symlinks (macOS /tmp)", () => {
  // mkdtempSync under /tmp returns a path whose realpath is /private/tmp/... on
  // macOS; the guard must compare against the canonical form or every
  // in-workspace path would be rejected.
  expect(guard.clamp("notes.txt").startsWith(guard.root)).toBe(true);
});

test("prefix-sibling directory does not pass the containment check", () => {
  // /tmp/ws-evil must not be treated as inside /tmp/ws.
  const r = mkdtempSync(join(tmpdir(), "houston-pfx-"));
  const ws = join(r, "ws");
  mkdirSync(ws);
  mkdirSync(join(r, "ws-evil"));
  writeFileSync(join(r, "ws-evil", "x.txt"), "x");
  const g = new WorkspaceGuard(ws);
  expect(() => g.clamp(join(r, "ws-evil", "x.txt"))).toThrow(PathEscapeError);
});
