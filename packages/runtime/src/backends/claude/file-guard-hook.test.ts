import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  HookCallback,
  HookJSONOutput,
  PreToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { fileToolGuardOptions } from "../../session/coordinator-policy";
import { learningsDocPath } from "../../session/learnings-context";
import { fileGuardHook } from "./file-guard-hook";

function workspace(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "claude-guard-hook-")));
  const runtime = join(root, ".houston", "runtime");
  mkdirSync(join(runtime, "auth-users"), { recursive: true });
  mkdirSync(join(runtime, "claude-login"), { recursive: true });
  writeFileSync(join(runtime, "auth.json"), "{}");
  writeFileSync(join(runtime, "auth-users", "x.json"), "{}");
  writeFileSync(join(root, "notes.md"), "notes");
  mkdirSync(join(root, "uploads"));
  writeFileSync(join(root, "uploads", "photo.png"), "png");
  return root;
}

async function run(
  hook: HookCallback,
  tool_name: string,
  tool_input: unknown,
): Promise<HookJSONOutput> {
  const input = {
    hook_event_name: "PreToolUse",
    tool_name,
    tool_input,
    tool_use_id: "tool-1",
    session_id: "s",
    transcript_path: "/dev/null",
    cwd: "/",
  } as PreToolUseHookInput;
  return hook(input, "tool-1", { signal: new AbortController().signal });
}

function decision(output: HookJSONOutput) {
  if (!("hookSpecificOutput" in output)) return { kind: "pass" as const };
  const specific = output.hookSpecificOutput;
  if (specific?.hookEventName !== "PreToolUse")
    return { kind: "pass" as const };
  if (specific.permissionDecision === "deny")
    return {
      kind: "deny" as const,
      reason: specific.permissionDecisionReason ?? "",
    };
  return { kind: "pass" as const, updatedInput: specific.updatedInput };
}

test("Read, Glob and Grep of the credential files are denied", async () => {
  const ws = workspace();
  const hook = fileGuardHook(ws);
  const calls: [string, Record<string, unknown>][] = [
    ["Read", { file_path: ".houston/runtime/auth.json" }],
    ["Read", { file_path: join(ws, ".houston/runtime/auth-users/x.json") }],
    ["Read", { file_path: "@.houston/runtime/AUTH.JSON" }],
    ["Read", { file_path: ".houston/runtime/auth.json::$DATA" }],
    ["Glob", { pattern: "*", path: ".houston/runtime/auth-users" }],
    ["Glob", { pattern: join(ws, ".houston/runtime/auth.json") }],
    ["Grep", { pattern: "token", path: ".houston/runtime/auth.json" }],
    ["Grep", { pattern: "token", path: ".houston/runtime/claude-login" }],
    ["Grep", { pattern: "token", path: ".houston/runtime/auth-users/x.json" }],
  ];
  for (const [tool, input] of calls) {
    const verdict = decision(await run(hook, tool, input));
    expect(verdict.kind, `${tool} ${JSON.stringify(input)}`).toBe("deny");
    if (verdict.kind === "deny")
      expect(verdict.reason).toMatch(/holds the sign-in credentials/);
  }
});

test("an ordinary read passes with the proven absolute path", async () => {
  const ws = workspace();
  const hook = fileGuardHook(ws);
  expect(
    decision(await run(hook, "Read", { file_path: "notes.md", limit: 5 })),
  ).toEqual({
    kind: "pass",
    updatedInput: { file_path: join(ws, "notes.md"), limit: 5 },
  });
  expect(
    decision(await run(hook, "Read", { file_path: "@uploads/photo.png" })),
  ).toMatchObject({
    updatedInput: { file_path: join(ws, "uploads", "photo.png") },
  });
  const colon =
    process.platform === "win32" ? "Standup 10" : "Standup 10:30.md";
  expect(
    decision(
      await run(hook, "Edit", {
        file_path: "Standup 10:30.md",
        old_string: "a",
      }),
    ),
  ).toMatchObject({ updatedInput: { file_path: join(ws, colon) } });
  expect(
    decision(await run(hook, "Grep", { pattern: "/api/", path: "uploads" })),
  ).toEqual({
    kind: "pass",
    updatedInput: { pattern: "/api/", path: join(ws, "uploads") },
  });
  expect(decision(await run(hook, "Grep", { pattern: "/etc/x" }))).toEqual({
    kind: "pass",
  });
  expect(decision(await run(hook, "Glob", { pattern: "**/*.md" }))).toEqual({
    kind: "pass",
  });
});

test("escapes are denied", async () => {
  const hook = fileGuardHook(workspace());
  const calls: [string, Record<string, unknown>][] = [
    ["Read", { file_path: "/etc/passwd" }],
    ["Read", { file_path: "../../outside.txt" }],
    ["Read", { file_path: "~/.ssh/id_rsa" }],
    ["Read", { file_path: "file:///etc/passwd" }],
    ["Glob", { pattern: "/etc/**/*.conf" }],
    ["Glob", { pattern: "../../**/*" }],
    ["Grep", { pattern: "x", path: "/var/log" }],
    ["Write", { file_path: "/tmp/out.txt", content: "x" }],
    ["NotebookEdit", { notebook_path: "/tmp/n.ipynb", new_source: "x" }],
    ["LS", { path: ".." }],
  ];
  for (const [tool, input] of calls)
    expect(
      decision(await run(hook, tool, input)).kind,
      `${tool} ${JSON.stringify(input)}`,
    ).toBe("deny");
});

test("a symlink inside the workspace is judged by where it points", async () => {
  const ws = workspace();
  const { symlinkSync } = await import("node:fs");
  symlinkSync(join(ws, ".houston/runtime/auth.json"), join(ws, "link.txt"));
  symlinkSync(join(ws, ".houston/runtime"), join(ws, "rt"));
  const hook = fileGuardHook(ws);
  for (const file_path of ["link.txt", "rt/auth-users/x.json"])
    expect(decision(await run(hook, "Read", { file_path })).kind).toBe("deny");
});

test("Write and Edit to protected paths are denied", async () => {
  const hook = fileGuardHook(workspace());
  const calls: [string, Record<string, unknown>][] = [
    ["Write", { file_path: ".houston/runtime/auth.json", content: "{}" }],
    ["Write", { file_path: ".houston/runtime/auth-users/y.json", content: "" }],
    ["Edit", { file_path: ".houston/runtime/claude-login/.credentials.json" }],
    ["Write", { file_path: ".houston/activity/activity.json", content: "[]" }],
    ["Edit", { file_path: ".houston/routines/routines.json" }],
    ["MultiEdit", { file_path: ".houston/runtime/auth.json", edits: [] }],
  ];
  for (const [tool, input] of calls)
    expect(
      decision(await run(hook, tool, input)).kind,
      `${tool} ${JSON.stringify(input)}`,
    ).toBe("deny");
});

test("the coordinator is held to its allowlist", async () => {
  const ws = workspace();
  const memory = learningsDocPath(ws);
  const hook = fileGuardHook(
    ws,
    fileToolGuardOptions({
      role: "coordinator",
      workspaceDir: ws,
      sharedSkillsDir: "",
    }),
  );
  expect(decision(await run(hook, "Read", { file_path: memory }))).toEqual({
    kind: "pass",
    updatedInput: { file_path: memory },
  });
  expect(
    decision(await run(hook, "Write", { file_path: memory, content: "[]" }))
      .kind,
  ).toBe("pass");
  expect(
    decision(await run(hook, "Read", { file_path: "uploads/photo.png" })),
  ).toEqual({
    kind: "pass",
    updatedInput: { file_path: join(ws, "uploads", "photo.png") },
  });
  writeFileSync(join(ws, "uploads", "auth.json"), "{}");
  const calls: [string, Record<string, unknown>][] = [
    ["Write", { file_path: "uploads/new.md", content: "x" }],
    ["Edit", { file_path: "uploads/photo.png", old_string: "p" }],
    ["Read", { file_path: "uploads/AUTH.JSON" }],
    ["Read", { file_path: "uploads/auth.json" }],
    ["Read", { file_path: "notes.md" }],
    ["Read", { file_path: "CLAUDE.md" }],
    ...(process.platform === "win32"
      ? []
      : ([["Write", { file_path: `${memory}:x`, content: "[]" }]] as [
          string,
          Record<string, unknown>,
        ][])),
    ["Read", { file_path: ".houston/runtime/auth.json" }],
    ["Grep", { pattern: "token" }],
    ["Glob", { pattern: "**/*" }],
    ["Write", { file_path: "notes.md", content: "x" }],
  ];
  for (const [tool, input] of calls)
    expect(
      decision(await run(hook, tool, input)).kind,
      `${tool} ${JSON.stringify(input)}`,
    ).toBe("deny");
});

test("Bash and Houston's MCP tools pass untouched; malformed file calls do not", async () => {
  const hook = fileGuardHook(workspace());
  expect(await run(hook, "Bash", { command: "ls" })).toEqual({});
  expect(await run(hook, "mcp__houston__ask_user", { path: "/etc" })).toEqual(
    {},
  );
  expect(decision(await run(hook, "Read", { file_path: 7 })).kind).toBe("deny");
  expect(decision(await run(hook, "Read", "auth.json")).kind).toBe("deny");
  expect(await run(hook, "ToolSearch", { query: "x" })).toEqual({});
});
