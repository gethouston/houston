import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fileToolGuardOptions } from "../coordinator-policy";
import { learningsDocPath } from "../learnings-context";
import { spillToolResult } from "../tool-results/spill";
import {
  PathDeniedError,
  PathNotAllowedError,
  ReadOnlyFolderError,
  WorkspaceGuard,
} from "./fs-guard";

/**
 * The coordinator's read-only attachments folder (H-044). Its wall is one
 * writable document (its memory); what people send it — a photo in the
 * composer, a PDF over Slack — lands in `uploads/`, and it must be able to READ
 * that or it cannot help with it. Everything the narrowed wall refuses must stay
 * refused, every write into the folder must be refused, and no link or `..`
 * detour may use the folder as a door to the rest of the workspace.
 */

interface Fixture {
  base: string;
  workspace: string;
  uploads: string;
  memory: string;
  guard: WorkspaceGuard;
}

/** A coordinator directory, guarded by the REAL policy the runtime builds. */
function coordinator(options: { uploads?: boolean } = {}): Fixture {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "houston-uploads-")));
  const workspace = join(base, ".assistant");
  const uploads = join(workspace, "uploads");
  mkdirSync(join(workspace, ".houston", "learnings"), { recursive: true });
  mkdirSync(join(workspace, ".houston", "runtime"), { recursive: true });
  writeFileSync(join(workspace, ".houston", "runtime", "auth.json"), "{}");
  writeFileSync(join(workspace, "WORKSPACE.md"), "context");
  const memory = learningsDocPath(workspace);
  writeFileSync(memory, "[]");
  if (options.uploads !== false) {
    mkdirSync(join(uploads, "docs"), { recursive: true });
    writeFileSync(join(uploads, "image.png"), "png");
    writeFileSync(join(uploads, "docs", "brief.pdf"), "pdf");
  }
  const policy = fileToolGuardOptions({
    role: "coordinator",
    workspaceDir: workspace,
    sharedSkillsDir: join(base, "shared"),
  });
  return {
    base,
    workspace,
    uploads,
    memory,
    guard: new WorkspaceGuard(workspace, policy),
  };
}

test("attachments are readable, flat and nested, by relative or absolute path", () => {
  const { uploads, guard } = coordinator();
  const image = join(uploads, "image.png");
  const nested = join(uploads, "docs", "brief.pdf");
  expect(guard.clamp("uploads/image.png")).toBe(image);
  expect(guard.clamp("uploads/docs/brief.pdf")).toBe(nested);
  expect(guard.clamp(image)).toBe(image);
  expect(guard.assertInside(nested)).toBe(nested);
});

test("a folder that appears after the guard was built is readable", () => {
  // The guard is built once at module load; the folder arrives with the first
  // upload, so it must be found when asked about, not when built.
  const { uploads, guard } = coordinator({ uploads: false });
  mkdirSync(uploads);
  writeFileSync(join(uploads, "late.png"), "png");
  expect(guard.clamp("uploads/late.png")).toBe(join(uploads, "late.png"));
});

test("nothing in the folder can be written, edited or created", () => {
  const { uploads, guard } = coordinator();
  for (const path of ["uploads/image.png", "uploads/new.md", "uploads/x/y.md"])
    expect(() => guard.clampWrite(path), path).toThrow(ReadOnlyFolderError);
  expect(() => guard.assertWritable(join(uploads, "image.png"))).toThrow(
    ReadOnlyFolderError,
  );
  // Before the folder exists too: creating it is a write like any other.
  const fresh = coordinator({ uploads: false });
  expect(() => fresh.guard.clampWrite("uploads/a.png")).toThrow(
    ReadOnlyFolderError,
  );
  expect(() => fresh.guard.assertWritable(fresh.uploads)).toThrow(
    ReadOnlyFolderError,
  );
});

test("the write refusal is plain words, not the shared-skills message", () => {
  const { guard } = coordinator();
  expect(() => guard.clampWrite("uploads/image.png")).toThrow(
    /kept exactly as it arrived/,
  );
  expect(() => guard.clampWrite("uploads/image.png")).not.toThrow(/skill/i);
});

test("`..` out of the folder lands on the narrowed wall", () => {
  const { guard } = coordinator();
  for (const path of [
    "uploads/../WORKSPACE.md",
    "uploads/../.houston/transcripts/assistant.jsonl",
    "uploads/../../outside.txt",
    "uploads/docs/../../.houston/runtime/auth.json",
  ])
    expect(() => guard.clamp(path), path).toThrow();
  expect(() => guard.clamp("uploads/../WORKSPACE.md")).toThrow(
    PathNotAllowedError,
  );
});

test("absolute, home and file:// paths outside the folder are refused", () => {
  const { guard } = coordinator();
  for (const path of ["/etc/passwd", "~/.ssh/id_rsa", "file:///etc/passwd"])
    expect(() => guard.clamp(path), path).toThrow(PathNotAllowedError);
});

test("a link in the folder cannot reach the rest of the workspace or beyond", () => {
  const { base, workspace, uploads, guard } = coordinator();
  writeFileSync(join(base, "outside.txt"), "outside");
  symlinkSync(join(workspace, "WORKSPACE.md"), join(uploads, "context.png"));
  symlinkSync(join(workspace, ".houston"), join(uploads, "data"));
  symlinkSync(join(base, "outside.txt"), join(uploads, "outside.png"));
  for (const path of [
    "uploads/context.png",
    "uploads/data/transcripts/assistant.jsonl",
    "uploads/outside.png",
  ])
    expect(() => guard.clamp(path), path).toThrow(PathNotAllowedError);
  // ...while a link that stays in the folder resolves to what it proved.
  symlinkSync(join(uploads, "image.png"), join(uploads, "alias.png"));
  expect(guard.clamp("uploads/alias.png")).toBe(join(uploads, "image.png"));
});

test("the folder itself being a link opens nothing", () => {
  for (const target of ["outside", "inside"] as const) {
    const fixture = coordinator({ uploads: false });
    const elsewhere =
      target === "outside"
        ? join(fixture.base, "elsewhere")
        : join(fixture.workspace, ".houston");
    mkdirSync(elsewhere, { recursive: true });
    writeFileSync(join(elsewhere, "image.png"), "png");
    symlinkSync(elsewhere, fixture.uploads);
    expect(() => fixture.guard.clamp("uploads/image.png"), target).toThrow(
      PathNotAllowedError,
    );
  }
});

test("credential material in the folder stays denied", () => {
  const { workspace, uploads, guard } = coordinator();
  mkdirSync(join(uploads, "auth-users"));
  mkdirSync(join(uploads, "claude-login"));
  for (const path of [
    "uploads/auth.json",
    "uploads/AUTH.JSON",
    "uploads/auth-users/abc.json",
    "uploads/claude-login/.credentials.json",
  ])
    expect(() => guard.clamp(path), path).toThrow(PathDeniedError);
  // A credential NAME is denied even when it points at an ordinary file...
  symlinkSync(join(uploads, "image.png"), join(uploads, "auth.json"));
  expect(() => guard.clamp("uploads/auth.json")).toThrow(PathDeniedError);
  // ...and an ordinary name cannot launder the runtime's real credentials.
  symlinkSync(
    join(workspace, ".houston", "runtime", "auth.json"),
    join(uploads, "photo.png"),
  );
  expect(() => guard.clamp("uploads/photo.png")).toThrow();
});

test("memory stays the one document it reads and writes", () => {
  const { memory, guard } = coordinator();
  expect(guard.clamp(".houston/learnings/learnings.json")).toBe(memory);
  expect(guard.clampWrite(".houston/learnings/learnings.json")).toBe(memory);
  expect(guard.assertWritable(memory)).toBe(memory);
});

test("the rest of the workspace stays refused, and the refusal names both", () => {
  const { memory, uploads, guard } = coordinator();
  for (const path of [
    "WORKSPACE.md",
    ".houston/transcripts/assistant.jsonl",
    ".houston/runtime/auth.json",
    ".",
  ])
    expect(() => guard.clamp(path), path).toThrow();
  expect(() => guard.clamp("WORKSPACE.md")).toThrow(memory);
  expect(() => guard.clamp("WORKSPACE.md")).toThrow(uploads);
});

test("a readable folder must be a narrowed wall's, and sit in the workspace", () => {
  const { base, workspace, memory } = coordinator();
  expect(
    () =>
      new WorkspaceGuard(workspace, { readableDirs: [join(workspace, "u")] }),
  ).toThrow(/allowedFiles/);
  for (const dir of [base, workspace, join(base, "elsewhere")])
    expect(
      () =>
        new WorkspaceGuard(workspace, {
          allowedFiles: [memory],
          readableDirs: [dir],
        }),
      dir,
    ).toThrow(/below the workspace/);
});

test("a workspace named through a symlinked path still finds its folder", () => {
  // macOS tmpdir is /var -> /private/var: the policy is built from the name the
  // host passed, the guard judges canonical paths.
  const lexicalBase = mkdtempSync(join(tmpdir(), "houston-uploads-lex-"));
  const workspace = join(lexicalBase, ".assistant");
  mkdirSync(join(workspace, "uploads"), { recursive: true });
  writeFileSync(join(workspace, "uploads", "a.png"), "png");
  const guard = new WorkspaceGuard(
    workspace,
    fileToolGuardOptions({
      role: "coordinator",
      workspaceDir: workspace,
      sharedSkillsDir: "",
    }),
  );
  const real = join(realpathSync(workspace), "uploads", "a.png");
  expect(guard.clamp("uploads/a.png")).toBe(real);
  expect(guard.clamp(join(workspace, "uploads", "a.png"))).toBe(real);
  expect(() => guard.clampWrite("uploads/a.png")).toThrow(ReadOnlyFolderError);
});

test("a tool result too big for context is readable where its pointer says, never writable", () => {
  const { workspace, guard } = coordinator();
  const spilled = spillToolResult(
    { workspaceDir: workspace, conversationId: "c1" },
    "houston_recall",
    "x".repeat(30_000),
  );
  expect(guard.clamp(spilled)).toBe(join(workspace, spilled));
  expect(() => guard.clampWrite(spilled)).toThrow(ReadOnlyFolderError);
  expect(() => guard.clamp(".tool-results/../WORKSPACE.md")).toThrow();
});
