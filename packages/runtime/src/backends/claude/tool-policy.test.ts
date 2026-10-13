import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
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

test("canUseTool denies Write and Edit on the board with the mission-tools refusal", async () => {
  const ws = workspace();
  const can = makeCanUseTool(ws);
  const board = ".houston/activity/activity.json";
  const refusal =
    "Your board is changed with the mission tools, not by editing files.";

  for (const tool of ["Write", "Edit"]) {
    const result = await decide(can, tool, { file_path: board });
    expect(result, tool).toEqual({ behavior: "deny", message: refusal });
    expect(
      (await decide(can, tool, { file_path: "notes.txt" })).behavior,
      tool,
    ).toBe("allow");
  }
  expect((await decide(can, "Read", { file_path: board })).behavior).toBe(
    "allow",
  );
});

test("canUseTool denies Write and Edit on routines but allows reads", async () => {
  const can = makeCanUseTool(workspace());
  const file_path = ".houston/routines/routines.json";
  const message =
    "Routines are changed with the routine tools, not by editing files.";
  for (const tool of ["Write", "Edit"]) {
    expect(await decide(can, tool, { file_path })).toEqual({
      behavior: "deny",
      message,
    });
  }
  expect((await decide(can, "Read", { file_path })).behavior).toBe("allow");
});

test("canUseTool treats shared roots as workspace: reads AND edits allowed", async () => {
  const ws = workspace();
  const shared = workspace();
  const can = makeCanUseTool(ws, { sharedRoots: [shared] });

  expect(
    (await decide(can, "Read", { file_path: join(shared, "SKILL.md") }))
      .behavior,
  ).toBe("allow");
  expect(
    (await decide(can, "Grep", { pattern: "step", path: shared })).behavior,
  ).toBe("allow");
  expect(
    (await decide(can, "Edit", { file_path: join(shared, "SKILL.md") }))
      .behavior,
  ).toBe("allow");
});

test("canUseTool denies an absolute-path escape", async () => {
  const can = makeCanUseTool(workspace());
  const r = await decide(can, "Read", { file_path: "/etc/passwd" });
  expect(r.behavior).toBe("deny");
  if (r.behavior === "deny")
    expect(r.message).toMatch(/outside the agent workspace/);
});

test("canUseTool denies the in-workspace credential files (Read/Write/Grep)", async () => {
  // The runtime's dataDir lives under the workspace root, so these paths pass
  // containment; the guard's credential deny is the only thing that stops them.
  const ws = workspace();
  const runtime = join(ws, ".houston", "runtime");
  mkdirSync(join(runtime, "auth-users"), { recursive: true });
  writeFileSync(join(runtime, "auth.json"), "{}");
  const can = makeCanUseTool(ws);
  const denied = [
    ["Read", { file_path: join(runtime, "auth.json") }],
    ["Write", { file_path: ".houston/runtime/auth.json" }],
    [
      "Read",
      { file_path: ".houston/runtime/auth-users/deadbeefdeadbeef.json" },
    ],
    ["Grep", { pattern: "access", path: ".houston/runtime/auth-users" }],
  ] as const;
  for (const [tool, input] of denied) {
    const r = await decide(can, tool, input);
    expect(r.behavior, `${tool} ${JSON.stringify(input)}`).toBe("deny");
    if (r.behavior === "deny")
      expect(r.message).toMatch(/holds the sign-in credentials/);
  }
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

test("Bash: a quoted or escaped workspace path with a space is allowed, a quoted escape still denied", async () => {
  // Most agents have a space in their name, so their workspace path does too.
  // Splitting the command on whitespace cut `.../neqw copia` into an absolute
  // `.../neqw` that failed containment (PRODUCT-1809).
  const root = join(workspace(), "neqw copia");
  mkdirSync(root);
  const can = makeCanUseTool(root);
  for (const command of [
    `cd "${root}" && ls`,
    `ls '${root}'`,
    `ls ${root.replace(" ", "\\ ")}`,
    `cat "${root}/notes.txt" > "${root}/copy.txt"`,
  ]) {
    expect((await decide(can, "Bash", { command })).behavior, command).toBe(
      "allow",
    );
  }
  // Quoting opens nothing: a quoted absolute path outside is one token, denied.
  for (const command of [
    'cat "/etc/passwd"',
    "cat '/etc/passwd'",
    "cat /etc/pass\\wd",
    `cat "${root}/../../etc/passwd"`,
    `cat "~/secret"`,
  ]) {
    expect((await decide(can, "Bash", { command })).behavior, command).toBe(
      "deny",
    );
  }
});

test("an unknown tool with no path targets is allowed", async () => {
  const can = makeCanUseTool(workspace());
  expect((await decide(can, "SomethingElse", { foo: "bar" })).behavior).toBe(
    "allow",
  );
});

test("the personal assistant gets Read alone", () => {
  // The coordinator never produces work and its memory changes only through
  // save_learning, so the SDK built-ins are clamped to Read (its memory and
  // attachments). Everything else is denied, Write and bash included, whatever
  // the deployment's code-execution setting says.
  const policy = buildToolPolicy({ localBash: true, personalAssistant: true });
  expect(policy.tools).toEqual(["Read"]);
  for (const denied of [
    "Bash",
    "Edit",
    "Write",
    "Glob",
    "Grep",
    "WebFetch",
    "WebSearch",
  ])
    expect(policy.disallowedTools).toContain(denied);

  // Plan mode keeps the same reading-only surface.
  const plan = buildToolPolicy({
    localBash: true,
    personalAssistant: true,
    mode: "plan",
  });
  expect(plan.tools).toEqual(["Read"]);
  expect(plan.disallowedTools).toContain("Write");
});

test("every other agent's built-in policy is untouched by the clamp", () => {
  expect(
    buildToolPolicy({ localBash: true, personalAssistant: false }),
  ).toEqual(buildToolPolicy({ localBash: true }));
});
