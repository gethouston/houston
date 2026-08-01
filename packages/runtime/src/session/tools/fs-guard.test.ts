import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";
import { PathDeniedError, PathEscapeError, WorkspaceGuard } from "./fs-guard";

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

/**
 * The runtime's own dataDir is a CHILD of the workspace root on every profile
 * (`<agentDir>/.houston/runtime`, see host.ts), so containment alone leaves
 * every team member's live provider tokens readable by the agent's file tools.
 * These cover the deny wall: the credential FAMILY is refused at any depth, by
 * both walls, for reads and writes — while ordinary `.houston` data stays open.
 */
function credentialRoot(): { root: string; guard: WorkspaceGuard } {
  // Canonical from the start: on macOS /tmp is itself a symlink, and an absolute
  // path through it would be rejected as an escape before the deny even runs.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "houston-cred-")));
  const runtime = join(root, ".houston", "runtime");
  mkdirSync(join(runtime, "auth-users"), { recursive: true });
  writeFileSync(join(runtime, "auth.json"), '{"anthropic":{"access":"tok"}}');
  writeFileSync(
    join(runtime, "auth-users", "deadbeefdeadbeef.json"),
    '{"anthropic":{"access":"tok"}}',
  );
  writeFileSync(
    join(runtime, "auth-users", "deadbeefdeadbeef.served-providers.json"),
    '["anthropic"]',
  );
  writeFileSync(join(runtime, "served-providers.json"), '["anthropic"]');
  writeFileSync(join(root, ".houston", "activity.json"), "[]");
  mkdirSync(join(root, ".houston", "conversations"), { recursive: true });
  writeFileSync(join(root, ".houston", "conversations", "c1.json"), "{}");
  writeFileSync(join(root, "CLAUDE.md"), "# agent");
  mkdirSync(join(root, "workspace"), { recursive: true });
  writeFileSync(join(root, "workspace", "notes.txt"), "notes");
  mkdirSync(join(root, "claude-login"), { recursive: true });
  writeFileSync(join(root, "claude-login", ".credentials.json"), "{}");
  return { root, guard: new WorkspaceGuard(root) };
}

const CREDENTIAL_PATHS = [
  ".houston/runtime/auth.json",
  ".houston/runtime/auth-users/deadbeefdeadbeef.json",
  ".houston/runtime/auth-users/deadbeefdeadbeef.served-providers.json",
  "./x/../.houston/runtime/auth.json",
  "claude-login/.credentials.json",
];

test("clamp denies every credential path shape (relative, traversal, absolute)", () => {
  const { root, guard } = credentialRoot();
  for (const p of CREDENTIAL_PATHS) {
    expect(() => guard.clamp(p), p).toThrow(PathDeniedError);
    expect(() => guard.clamp(join(root, p)), `absolute ${p}`).toThrow(
      PathDeniedError,
    );
  }
});

test("assertInside denies credential paths pi already resolved (inner wall)", () => {
  const { guard } = credentialRoot();
  for (const p of CREDENTIAL_PATHS) {
    expect(() => guard.assertInside(join(guard.root, p)), p).toThrow(
      PathDeniedError,
    );
  }
});

test("the credential deny is depth-independent and case-insensitive", () => {
  const { guard } = credentialRoot();
  // A deeper (or shallower) layout must not become readable, and a
  // case-insensitive filesystem would otherwise serve auth.json for AUTH.JSON.
  expect(() => guard.clamp("auth.json")).toThrow(PathDeniedError);
  expect(() => guard.clamp("a/b/c/auth-users/x.json")).toThrow(PathDeniedError);
  expect(() => guard.clamp(".houston/runtime/AUTH.json")).toThrow(
    PathDeniedError,
  );
  expect(() => guard.clamp(".houston/runtime/Auth-Users/x.json")).toThrow(
    PathDeniedError,
  );
});

test("a symlink inside the workspace cannot launder a credential path", () => {
  const { guard, root } = credentialRoot();
  symlinkSync(
    join(root, ".houston", "runtime", "auth.json"),
    join(root, "innocent.txt"),
  );
  expect(() => guard.clamp("innocent.txt")).toThrow(PathDeniedError);
});

test("the deny message never quotes credential contents", () => {
  const { guard } = credentialRoot();
  let message = "";
  try {
    guard.clamp(".houston/runtime/auth.json");
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).not.toContain("tok");
  expect(message).not.toContain("anthropic");
});

test("ordinary .houston data and workspace files stay allowed", () => {
  const { guard } = credentialRoot();
  for (const p of [
    ".houston/activity.json",
    // The TEAM served-providers manifest is a provider-name list, not a secret.
    ".houston/runtime/served-providers.json",
    ".houston/conversations/c1.json",
    "CLAUDE.md",
    "workspace/notes.txt",
  ]) {
    expect(guard.clamp(p), p).toBe(join(guard.root, p));
    expect(guard.assertInside(join(guard.root, p)), p).toBe(
      join(guard.root, p),
    );
  }
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

test("a shared root is fully usable: reads AND writes clamp inside it", () => {
  // Agents edit the org original directly (the no-fork decision) — the shared
  // mirror is a writable root, with the same containment walls as the
  // workspace. Deletion is not a file-tool operation, so removing a shared
  // skill stays a UI/admin act.
  const ws = freshRoot();
  const shared = mkdtempSync(join(tmpdir(), "houston-shared-"));
  const skillFile = join(shared, "research-company", "SKILL.md");
  mkdirSync(join(shared, "research-company"));
  writeFileSync(skillFile, "shared skill");
  const g = new WorkspaceGuard(ws, { sharedRoots: [shared] });
  const canonicalSkillFile = realpathSync(skillFile);

  expect(g.clamp(canonicalSkillFile)).toBe(canonicalSkillFile);
  expect(g.assertInside(canonicalSkillFile)).toBe(canonicalSkillFile);
});

test("a symlink inside a shared root cannot escape that root", () => {
  const ws = freshRoot();
  const shared = mkdtempSync(join(tmpdir(), "houston-shared-"));
  const outside = mkdtempSync(join(tmpdir(), "houston-outside-"));
  writeFileSync(join(outside, "secret.txt"), "secret");
  symlinkSync(outside, join(shared, "escaped"));
  const g = new WorkspaceGuard(ws, { sharedRoots: [shared] });
  const [canonicalShared] = g.sharedRoots;
  if (!canonicalShared) throw new Error("expected the shared root to exist");

  expect(() => g.clamp(join(canonicalShared, "escaped", "secret.txt"))).toThrow(
    PathEscapeError,
  );
});

test("without an existing shared root, everything stays workspace-only", () => {
  const ws = freshRoot();
  const g = new WorkspaceGuard(ws, {
    sharedRoots: [join(ws, "missing-shared-root")],
  });

  expect(g.sharedRoots).toEqual([]);
  expect(g.clamp("notes.txt")).toBe(join(g.root, "notes.txt"));
  expect(() => g.clamp("/etc/passwd")).toThrow(PathEscapeError);
});
