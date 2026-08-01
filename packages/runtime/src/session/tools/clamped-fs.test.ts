import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
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

/**
 * The runtime's dataDir lives INSIDE the workspace (`<agentDir>/.houston/
 * runtime`), so containment cannot protect the credential files — every team
 * member's provider tokens sit on a path the file tools can otherwise resolve.
 * Drive pi's real tools at them and prove the deny wall holds end to end.
 */
// Canonical root: on macOS /tmp is a symlink, and an absolute path through it
// would be rejected as an escape before the credential deny even runs.
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
  // Containment still holds: a path outside every root stays rejected.
  await expect(
    run("write", { path: "/etc/houston-nope", content: "x" }),
  ).rejects.toThrow("outside the agent workspace");
});
