import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import type {
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { buildToolPolicy, makeCanUseTool } from "./tool-policy";

// The permission-context 3rd arg is unused by the clamp; a stub typed from the
// SDK's own signature keeps the call site honest without `any`.
const CTX: Parameters<CanUseTool>[2] = {
  signal: new AbortController().signal,
  toolUseID: "t",
  requestId: "r",
};

// realpath so the root matches WorkspaceGuard's canonicalization (on macOS the
// tmpdir is a /var → /private/var symlink; an un-canonicalized root would make
// every absolute in-workspace path look like an escape).
function workspace(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "claude-ws-")));
}

/** Invoke the gate and assert it returned a decision (never null here). */
async function decide(
  can: CanUseTool,
  tool: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  const r = await can(tool, input, CTX);
  if (!r) throw new Error("expected a permission result");
  return r;
}

test("buildToolPolicy grants Bash only when code execution is local", () => {
  const local = buildToolPolicy({ localBash: true });
  expect(local.tools).toEqual([
    "Read",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "Bash",
  ]);
  expect(local.disallowedTools).not.toContain("Bash");
  expect(local.disallowedTools).toContain("WebSearch");

  const off = buildToolPolicy({ localBash: false });
  expect(off.tools).toEqual(["Read", "Edit", "Write", "Glob", "Grep"]);
  // Bash is both omitted from availability AND explicitly denied.
  expect(off.disallowedTools).toContain("Bash");
});

test("plan mode clamps built-ins to Read/Glob/Grep and denies Edit/Write/Bash", () => {
  const plan = buildToolPolicy({ localBash: true, mode: "plan" });
  expect(plan.tools).toEqual(["Read", "Glob", "Grep"]);
  for (const denied of ["Edit", "Write", "Bash"])
    expect(plan.disallowedTools).toContain(denied);
  // The pi-lacking set is still denied on top of the write/exec denials.
  expect(plan.disallowedTools).toContain("WebSearch");
  // localBash is irrelevant in plan mode: no Bash either way.
  const planNoBash = buildToolPolicy({ localBash: false, mode: "plan" });
  expect(planNoBash.tools).toEqual(["Read", "Glob", "Grep"]);
  expect(planNoBash.disallowedTools).toContain("Bash");
});

test("execute mode is unchanged by the added mode param", () => {
  expect(buildToolPolicy({ localBash: true, mode: "execute" })).toEqual(
    buildToolPolicy({ localBash: true }),
  );
  expect(buildToolPolicy({ localBash: false, mode: "execute" })).toEqual(
    buildToolPolicy({ localBash: false }),
  );
});

test("auto mode keeps the SAME built-in policy as execute (file tools + Bash per localBash)", () => {
  // Auto's "never wait" rule is enforced on the MCP side (ask_user dropped), not
  // in the built-in policy — the Claude built-ins have no blocking tool to clamp.
  expect(buildToolPolicy({ localBash: true, mode: "auto" })).toEqual(
    buildToolPolicy({ localBash: true }),
  );
  expect(buildToolPolicy({ localBash: false, mode: "auto" })).toEqual(
    buildToolPolicy({ localBash: false }),
  );
});

test("the pi-lacking Claude Code tools are always disallowed", () => {
  const { disallowedTools } = buildToolPolicy({ localBash: true });
  for (const t of [
    "Task",
    "TodoWrite",
    "NotebookEdit",
    "WebFetch",
    "WebSearch",
  ])
    expect(disallowedTools).toContain(t);
});

test("canUseTool approves a file tool whose path is inside the workspace", async () => {
  const ws = workspace();
  const can = makeCanUseTool(ws);
  const r = await decide(can, "Read", { file_path: join(ws, "notes.txt") });
  expect(r).toEqual({
    behavior: "allow",
    updatedInput: { file_path: join(ws, "notes.txt") },
  });
});

test("canUseTool denies an absolute-path escape", async () => {
  const can = makeCanUseTool(workspace());
  const r = await decide(can, "Read", { file_path: "/etc/passwd" });
  expect(r.behavior).toBe("deny");
  if (r.behavior === "deny")
    expect(r.message).toMatch(/outside the agent workspace/);
});

test("canUseTool denies a `..` traversal escape", async () => {
  const can = makeCanUseTool(workspace());
  const r = await decide(can, "Write", {
    file_path: `..${sep}..${sep}escape.txt`,
  });
  expect(r.behavior).toBe("deny");
});

test("canUseTool denies a `~` home-relative escape", async () => {
  const can = makeCanUseTool(workspace());
  const r = await decide(can, "Edit", { file_path: "~/secret" });
  expect(r.behavior).toBe("deny");
});

test("Glob / Grep: an in-workspace base path is allowed, an escape denied", async () => {
  const ws = workspace();
  mkdirSync(join(ws, "sub"));
  const can = makeCanUseTool(ws);
  expect(
    (await decide(can, "Glob", { pattern: "**/*.ts", path: join(ws, "sub") }))
      .behavior,
  ).toBe("allow");
  expect(
    (await decide(can, "Grep", { pattern: "x", path: "/var/log" })).behavior,
  ).toBe("deny");
  // No base path → defaults to cwd, allowed.
  expect((await decide(can, "Glob", { pattern: "**/*" })).behavior).toBe(
    "allow",
  );
});

test("Glob: an absolute pattern with no path is denied", async () => {
  // Regression: Glob's real target is its PATTERN. With no `path`, an absolute
  // pattern must be clamped, not fail open to an out-of-workspace read.
  const can = makeCanUseTool(workspace());
  expect(
    (await decide(can, "Glob", { pattern: "/etc/**/*.conf" })).behavior,
  ).toBe("deny");
});

test("Glob: a `..`-escaping pattern with no path is denied", async () => {
  const can = makeCanUseTool(workspace());
  expect(
    (await decide(can, "Glob", { pattern: "../../../../etc/*" })).behavior,
  ).toBe("deny");
});

test("Grep: an absolute pattern with no path is denied", async () => {
  const can = makeCanUseTool(workspace());
  expect(
    (await decide(can, "Grep", { pattern: "/etc/**/*.conf" })).behavior,
  ).toBe("deny");
});

test("Glob: a benign relative pattern with no path is allowed", async () => {
  const can = makeCanUseTool(workspace());
  expect((await decide(can, "Glob", { pattern: "**/*.ts" })).behavior).toBe(
    "allow",
  );
});

test("Bash: a cwd-bound command is allowed, an absolute/home escape denied", async () => {
  const can = makeCanUseTool(workspace());
  expect(
    (await decide(can, "Bash", { command: "ls ./sub && echo hi" })).behavior,
  ).toBe("allow");
  expect(
    (await decide(can, "Bash", { command: "cat /etc/passwd" })).behavior,
  ).toBe("deny");
  expect(
    (await decide(can, "Bash", { command: "cat ~/secret" })).behavior,
  ).toBe("deny");
  // Regression: `..` is relative but still escapes — must not fail open.
  expect(
    (await decide(can, "Bash", { command: "cat ../../../../etc/passwd" }))
      .behavior,
  ).toBe("deny");
});

test("an unknown tool with no path targets is allowed", async () => {
  const can = makeCanUseTool(workspace());
  expect((await decide(can, "SomethingElse", { foo: "bar" })).behavior).toBe(
    "allow",
  );
});
