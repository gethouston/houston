import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "./clamped-fs";

const base = mkdtempSync(join(tmpdir(), "houston-clamp-"));
const ws = join(base, "workspace");
mkdirSync(ws);
writeFileSync(join(ws, "hello.txt"), "hello from the workspace");
mkdirSync(join(ws, "docs"));
writeFileSync(join(base, "auth.json"), JSON.stringify({ access: "SECRET" }));

const tools = new Map(makeClampedFileTools(ws).map((t) => [t.name, t]));
const exec = (name: string, params: Record<string, unknown>) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool.execute(
    "call-1",
    params as Parameters<typeof tool.execute>[1],
    undefined,
    undefined,
    {} as Parameters<typeof tool.execute>[4],
  );
};

test("all six file tools are produced with the builtin-shadowing names", () => {
  expect([...tools.keys()].sort()).toEqual([...CLAMPED_FILE_TOOL_NAMES].sort());
});

test("read: normal workspace read works through pi's real implementation", async () => {
  const result = await exec("read", { path: "hello.txt" });
  expect(JSON.stringify(result.content)).toContain("hello from the workspace");
});

test("read: absolute, traversal, and sibling-credential paths all throw", async () => {
  await expect(exec("read", { path: "/etc/passwd" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("read", { path: "../auth.json" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("read", { path: join(base, "auth.json") })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("write: creates files inside, throws outside", async () => {
  await exec("write", { path: "docs/new.txt", content: "fresh" });
  expect(readFileSync(join(ws, "docs", "new.txt"), "utf8")).toBe("fresh");
  await expect(
    exec("write", { path: "/tmp/houston-escape.txt", content: "x" }),
  ).rejects.toThrow("outside the agent workspace");
  await expect(
    exec("write", { path: "../escape.txt", content: "x" }),
  ).rejects.toThrow("outside the agent workspace");
});

test("edit: applies real edits inside, throws outside", async () => {
  writeFileSync(join(ws, "editable.txt"), "alpha beta gamma");
  await exec("edit", {
    path: "editable.txt",
    edits: [{ oldText: "beta", newText: "BETA" }],
  });
  expect(readFileSync(join(ws, "editable.txt"), "utf8")).toBe(
    "alpha BETA gamma",
  );
  await expect(
    exec("edit", {
      path: "../auth.json",
      edits: [{ oldText: "SECRET", newText: "owned" }],
    }),
  ).rejects.toThrow("outside the agent workspace");
});

test("ls: lists the workspace by default, throws outside", async () => {
  const result = await exec("ls", {});
  expect(JSON.stringify(result.content)).toContain("hello.txt");
  await expect(exec("ls", { path: "/" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("ls", { path: ".." })).rejects.toThrow(
    "outside the agent workspace",
  );
});

test("grep: hostile search path throws before any rg spawn", async () => {
  await expect(exec("grep", { pattern: "root", path: "/etc" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(
    exec("grep", { pattern: "access", path: "../" }),
  ).rejects.toThrow("outside the agent workspace");
});

test("find: hostile search path throws before any fd spawn", async () => {
  await expect(exec("find", { pattern: "*.json", path: "/" })).rejects.toThrow(
    "outside the agent workspace",
  );
  await expect(exec("find", { pattern: "auth*", path: ".." })).rejects.toThrow(
    "outside the agent workspace",
  );
});

const runtimeDir = join(realpathSync(ws), ".houston", "runtime");
mkdirSync(join(runtimeDir, "auth-users"), { recursive: true });
writeFileSync(
  join(runtimeDir, "auth.json"),
  JSON.stringify({ a: "TEAMTOKEN" }),
);
writeFileSync(
  join(runtimeDir, "auth-users", "deadbeefdeadbeef.json"),
  JSON.stringify({ a: "MEMBERTOKEN" }),
);
writeFileSync(join(runtimeDir, "served-providers.json"), '["anthropic"]');

test("read: credential files inside the workspace are denied, ordinary data is not", async () => {
  for (const path of [
    ".houston/runtime/auth.json",
    ".houston/runtime/auth-users/deadbeefdeadbeef.json",
    join(runtimeDir, "auth.json"),
  ]) {
    await expect(exec("read", { path }), path).rejects.toThrow(
      /sign-in credentials/,
    );
  }
  const ok = await exec("read", {
    path: ".houston/runtime/served-providers.json",
  });
  expect(JSON.stringify(ok.content)).toContain("anthropic");
});

test("write/edit cannot overwrite a credential file either", async () => {
  await expect(
    exec("write", { path: ".houston/runtime/auth.json", content: "{}" }),
  ).rejects.toThrow(/sign-in credentials/);
  await expect(
    exec("edit", {
      path: ".houston/runtime/auth-users/deadbeefdeadbeef.json",
      edits: [{ oldText: "MEMBERTOKEN", newText: "owned" }],
    }),
  ).rejects.toThrow(/sign-in credentials/);
  expect(
    readFileSync(
      join(runtimeDir, "auth-users", "deadbeefdeadbeef.json"),
      "utf8",
    ),
  ).toContain("MEMBERTOKEN");
});

test("board file tools allow reading but refuse writes and edits", async () => {
  const board = join(ws, ".houston", "activity", "activity.json");
  mkdirSync(join(ws, ".houston", "activity"), { recursive: true });
  writeFileSync(board, '[{"origin_session_key":"parent"}]');
  const read = await exec("read", { path: ".houston/activity/activity.json" });
  expect(JSON.stringify(read.content)).toContain("origin_session_key");
  await expect(
    exec("write", { path: ".houston/activity/activity.json", content: "[]" }),
  ).rejects.toThrow(
    "Your board is changed with the mission tools, not by editing files.",
  );
  await expect(
    exec("edit", {
      path: ".houston/activity/activity.json",
      edits: [{ oldText: "parent", newText: "" }],
    }),
  ).rejects.toThrow(
    "Your board is changed with the mission tools, not by editing files.",
  );
  expect(readFileSync(board, "utf8")).toContain("parent");
  await exec("write", {
    path: ".houston/runtime/ordinary.json",
    content: "ordinary",
  });
  expect(
    readFileSync(join(ws, ".houston", "runtime", "ordinary.json"), "utf8"),
  ).toBe("ordinary");
});

test("a symlink cannot give write access to the board", async () => {
  const board = join(ws, ".houston", "activity", "activity.json");
  mkdirSync(join(ws, ".houston", "activity"), { recursive: true });
  writeFileSync(board, "[]");
  const alias = join(ws, "board-alias.json");
  symlinkSync(board, alias);
  await expect(
    exec("write", { path: "board-alias.json", content: "tampered" }),
  ).rejects.toThrow(
    "Your board is changed with the mission tools, not by editing files.",
  );
  expect(readFileSync(board, "utf8")).toBe("[]");
});

test("routines file tools allow reads but refuse writes and edits", async () => {
  const file = join(ws, ".houston", "routines", "routines.json");
  mkdirSync(join(ws, ".houston", "routines"), { recursive: true });
  writeFileSync(file, '[{"name":"original"}]');
  const path = ".houston/routines/routines.json";
  const refusal =
    "Routines are changed with the routine tools, not by editing files.";

  expect(JSON.stringify((await exec("read", { path })).content)).toContain(
    "original",
  );
  await expect(exec("write", { path, content: "[]" })).rejects.toThrow(refusal);
  await expect(
    exec("edit", {
      path,
      edits: [{ oldText: "original", newText: "changed" }],
    }),
  ).rejects.toThrow(refusal);
  expect(readFileSync(file, "utf8")).toBe('[{"name":"original"}]');
});

test("ls and grep cannot enumerate or search the credential dir", async () => {
  await expect(
    exec("ls", { path: ".houston/runtime/auth-users" }),
  ).rejects.toThrow(/sign-in credentials/);
  await expect(
    exec("grep", { pattern: "access", path: ".houston/runtime/auth-users" }),
  ).rejects.toThrow(/sign-in credentials/);
});

test("non-string path is rejected, not coerced", async () => {
  await expect(exec("read", { path: 42 })).rejects.toThrow(
    "'path' must be a string",
  );
});

test("shared roots are fully usable through file tools (agents edit the org original)", async () => {
  const shared = join(base, "shared-skills");
  const skillDir = join(shared, "research-company");
  mkdirSync(skillDir, { recursive: true });
  const skillFile = join(skillDir, "SKILL.md");
  writeFileSync(skillFile, "shared procedure");
  const sharedTools = new Map(
    makeClampedFileTools(ws, { sharedRoots: [shared] }).map((tool) => [
      tool.name,
      tool,
    ]),
  );
  const run = (name: string, params: Record<string, unknown>) => {
    const tool = sharedTools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(
      "call-shared",
      params as Parameters<typeof tool.execute>[1],
      undefined,
      undefined,
      {} as Parameters<typeof tool.execute>[4],
    );
  };

  const read = await run("read", { path: skillFile });
  expect(JSON.stringify(read.content)).toContain("shared procedure");
  await run("write", { path: skillFile, content: "replaced procedure" });
  expect(readFileSync(skillFile, "utf8")).toBe("replaced procedure");
  await expect(
    run("write", { path: "/etc/houston-nope", content: "x" }),
  ).rejects.toThrow("outside the agent workspace");
});
