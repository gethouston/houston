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
import {
  PathDeniedError,
  PathEscapeError,
  PathNotAllowedError,
  ProtectedWriteDeniedError,
  SharedSkillReadOnlyError,
  WorkspaceGuard,
} from "./fs-guard";

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
  expect(() => g.clamp("evil-dir/new-file.txt")).toThrow(PathEscapeError);
});

test("a sibling data dir (auth.json) is unreachable from the workspace", () => {
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
  expect(guard.clamp("notes.txt").startsWith(guard.root)).toBe(true);
});

function credentialRoot(): { root: string; guard: WorkspaceGuard } {
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
  const r = mkdtempSync(join(tmpdir(), "houston-pfx-"));
  const ws = join(r, "ws");
  mkdirSync(ws);
  mkdirSync(join(r, "ws-evil"));
  writeFileSync(join(r, "ws-evil", "x.txt"), "x");
  const g = new WorkspaceGuard(ws);
  expect(() => g.clamp(join(r, "ws-evil", "x.txt"))).toThrow(PathEscapeError);
});

test("a shared root is fully usable: reads AND writes clamp inside it", () => {
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

test("a read-only root can be read and never written", () => {
  const ws = freshRoot();
  const snapshot = mkdtempSync(join(tmpdir(), "houston-shared-snapshot-"));
  mkdirSync(join(snapshot, "invoices"));
  writeFileSync(join(snapshot, "invoices", "SKILL.md"), "shared skill");
  const g = new WorkspaceGuard(ws, { readOnlyRoots: [snapshot] });
  const skill = realpathSync(join(snapshot, "invoices", "SKILL.md"));

  expect(g.clamp(skill)).toBe(skill);
  expect(g.assertInside(skill)).toBe(skill);
  expect(() => g.clampWrite(skill)).toThrow(SharedSkillReadOnlyError);
  expect(() => g.assertWritable(skill)).toThrow(SharedSkillReadOnlyError);
  expect(() =>
    g.clampWrite(join(realpathSync(snapshot), "invoices", "new.md")),
  ).toThrow(SharedSkillReadOnlyError);
  expect(g.clampWrite("notes.txt")).toBe(join(g.root, "notes.txt"));
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

function coordinatorFixture(): {
  workspace: string;
  shared: string;
  memory: string;
  guard: WorkspaceGuard;
} {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "houston-coord-")));
  const workspace = join(base, ".assistant");
  const shared = join(base, "shared-skills");
  mkdirSync(join(workspace, ".houston", "learnings"), { recursive: true });
  mkdirSync(join(shared, "deploy"), { recursive: true });
  writeFileSync(join(shared, "deploy", "SKILL.md"), "shared");
  writeFileSync(join(workspace, "WORKSPACE.md"), "config");
  const memory = join(workspace, ".houston", "learnings", "learnings.json");
  writeFileSync(memory, "[]");
  return {
    workspace,
    shared,
    memory,
    guard: new WorkspaceGuard(workspace, {
      sharedRoots: [shared],
      allowedFiles: [memory],
    }),
  };
}

test("an allowlisted document is reachable by relative and absolute path", () => {
  const { workspace, memory, guard } = coordinatorFixture();
  expect(guard.clamp(memory)).toBe(memory);
  expect(guard.clamp(".houston/learnings/learnings.json")).toBe(memory);
  expect(guard.assertInside(memory)).toBe(memory);
  expect(guard.root).toBe(workspace);
});

test("the shared skills mirror is refused even though it is a shared root", () => {
  const { shared, guard } = coordinatorFixture();
  expect(() => guard.clamp(join(shared, "deploy", "SKILL.md"))).toThrow(
    PathNotAllowedError,
  );
  expect(() => guard.assertInside(join(shared, "deploy", "SKILL.md"))).toThrow(
    PathNotAllowedError,
  );
});

test("everything else in its own workspace is refused too", () => {
  const { workspace, guard } = coordinatorFixture();
  for (const path of [
    join(workspace, "WORKSPACE.md"),
    join(workspace, ".houston", "transcripts", "assistant.jsonl"),
    join(workspace, ".houston", "runtime", "auth.json"),
    ".",
    "notes.txt",
  ]) {
    expect(() => guard.clamp(path)).toThrow(PathNotAllowedError);
  }
});

test("the refusal names the document the runtime may touch", () => {
  const { memory, guard } = coordinatorFixture();
  expect(() => guard.clamp("/etc/passwd")).toThrow(memory);
});

test("a symlink cannot stand in for a path outside the allowlist", () => {
  const { workspace, shared, memory, guard } = coordinatorFixture();
  const link = join(workspace, ".houston", "learnings", "link.json");
  symlinkSync(join(shared, "deploy", "SKILL.md"), link);
  expect(() => guard.clamp(link)).toThrow(PathNotAllowedError);
  const alias = join(workspace, "memory-alias.json");
  symlinkSync(memory, alias);
  expect(guard.clamp(alias)).toBe(memory);
});

test("an allowlisted path that IS a symlink out of the workspace is refused", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "houston-coord-link-")));
  const workspace = join(base, ".assistant");
  const outside = join(base, "outside");
  mkdirSync(join(workspace, ".houston", "learnings"), { recursive: true });
  mkdirSync(outside);
  const target = join(outside, "secrets.json");
  writeFileSync(target, "[]");
  const memory = join(workspace, ".houston", "learnings", "learnings.json");
  symlinkSync(target, memory);
  const guard = new WorkspaceGuard(workspace, { allowedFiles: [memory] });

  expect(() => guard.clamp(memory)).toThrow(PathEscapeError);
  expect(() => guard.clamp(target)).toThrow();
  expect(() => guard.assertInside(memory)).toThrow(PathEscapeError);
});

test("an allowlisted credential file is denied, list or no list", () => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "houston-coord-cred-")),
  );
  mkdirSync(join(workspace, ".houston", "runtime"), { recursive: true });
  const auth = join(workspace, ".houston", "runtime", "auth.json");
  writeFileSync(auth, "{}");
  const guard = new WorkspaceGuard(workspace, { allowedFiles: [auth] });

  expect(() => guard.clamp(auth)).toThrow(PathDeniedError);
  expect(() => guard.assertInside(auth)).toThrow(PathDeniedError);
});

test("a symlink to an allowlisted credential file is denied too", () => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "houston-coord-cred2-")),
  );
  mkdirSync(join(workspace, ".houston", "runtime"), { recursive: true });
  const auth = join(workspace, ".houston", "runtime", "auth.json");
  writeFileSync(auth, "{}");
  const alias = join(workspace, "notes.json");
  symlinkSync(auth, alias);
  const guard = new WorkspaceGuard(workspace, { allowedFiles: [auth] });

  expect(() => guard.clamp(alias)).toThrow(PathDeniedError);
});

test("the guard answers with the path it proved, not the name it was given", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "houston-real-")));
  const workspace = join(base, "ws");
  mkdirSync(join(workspace, "docs"), { recursive: true });
  const real = join(workspace, "docs", "notes.md");
  writeFileSync(real, "hi");
  const link = join(workspace, "notes-link.md");
  symlinkSync(real, link);
  const guard = new WorkspaceGuard(workspace);
  expect(guard.clamp(link)).toBe(real);
  expect(guard.assertInside(link)).toBe(real);
});

test("routines stay readable but every write path refuses the routines store", () => {
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "houston-routines-")),
  );
  const routines = join(workspace, ".houston", "routines");
  mkdirSync(routines, { recursive: true });
  const file = join(routines, "routines.json");
  writeFileSync(file, "[]");
  const alias = join(workspace, "routines-alias.json");
  symlinkSync(file, alias);
  const guard = new WorkspaceGuard(workspace);
  const refusal =
    "Routines are changed with the routine tools, not by editing files.";

  expect(guard.clamp(file)).toBe(file);
  expect(guard.assertInside(file)).toBe(file);
  for (const path of [
    ".houston/routines/routines.json",
    file,
    alias,
    ".houston/routines/new.json",
    ".houston/routines.json",
  ]) {
    expect(() => guard.clampWrite(path), path).toThrow(refusal);
  }
  expect(() => guard.assertWritable(file)).toThrow(refusal);
  for (const path of [
    ".houston/activity/activity.json",
    ".houston/activity.json",
  ]) {
    expect(() => guard.clampWrite(path), path).toThrow(
      "Your board is changed with the mission tools, not by editing files.",
    );
  }
  expect(guard.clampWrite(".houston/routines.md")).toBe(
    join(workspace, ".houston", "routines.md"),
  );
});

test("an NTFS data-stream suffix cannot launder a denied name", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "houston-ads-")));
  mkdirSync(join(workspace, ".houston", "runtime"), { recursive: true });
  const guard = new WorkspaceGuard(workspace);
  for (const suffix of ["::$DATA", ":hidden"]) {
    expect(() => guard.clamp(`.houston/runtime/auth.json${suffix}`)).toThrow(
      PathDeniedError,
    );
  }
});

test("outside Windows a `:` is part of the file name the guard hands back", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "houston-colon-")));
  const guard = new WorkspaceGuard(workspace);
  expect(guard.clamp("notes/Standup 10:30.md")).toBe(
    join(
      workspace,
      "notes",
      process.platform === "win32" ? "Standup 10" : "Standup 10:30.md",
    ),
  );
});

test("a name a case-insensitive volume folds onto a protected one is refused", () => {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), "houston-fold-")));
  const runtime = join(workspace, ".houston", "runtime");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, "auth.json"), "{}");
  const guard = new WorkspaceGuard(workspace);
  for (const lookalike of [
    ".houston/runtime/auth.j\u017Fon",
    ".houston/runtime/auth-u\u017Fers/abc.json",
    ".houston/runtime/CLAUDE-LOGIN/.credentials.json",
    ".houston/runtime/auth.json.",
    ".houston/runtime/auth.json ",
    ".houston/runtime/auth-users. /abc.json",
    ".houston/runtime/auth-users::$INDEX_ALLOCATION./abc.json",
    ".houston/runtime/auth-users:$i30:$INDEX_ALLOCATION./abc.json",
  ])
    expect(() => guard.clampWrite(lookalike), lookalike).toThrow(
      PathDeniedError,
    );
  for (const store of [".houston/ACTIVITY/x.json", ".houston/Routines.json"])
    expect(() => guard.clampWrite(store), store).toThrow(
      ProtectedWriteDeniedError,
    );
});
