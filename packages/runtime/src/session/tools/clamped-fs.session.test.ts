import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// `getModel` is pi-ai's legacy static-catalog read, preserved on `/compat`.
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  AuthStorage,
  createAgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "./clamped-fs";

/**
 * The shadowing proof for Gate #1: in a REAL AgentSession built exactly like
 * chat.ts builds one, the clamped definitions must override pi's builtins
 * (pi registers customs after builtins in its tool registry, so same-name
 * customs win). If a pi upgrade ever flips that order, the session would
 * silently fall back to the UNCLAMPED builtins — this test is what fails.
 */

const base = mkdtempSync(join(tmpdir(), "houston-shadow-"));
const ws = join(base, "workspace");
const agentDir = join(base, "agent");
mkdirSync(ws);
mkdirSync(agentDir);
writeFileSync(join(ws, "in.txt"), "inside the workspace");
// The crown jewel: a credential file OUTSIDE the workspace, next to it.
writeFileSync(join(base, "auth.json"), JSON.stringify({ secret: true }));

test("clamped tools shadow pi builtins inside a real AgentSession", async () => {
  const { session } = await createAgentSession({
    cwd: ws,
    agentDir,
    authStorage: AuthStorage.create(join(agentDir, "auth.json")),
    model: getModel("anthropic", "claude-sonnet-4-5") as never,
    sessionManager: SessionManager.inMemory(),
    tools: [...CLAMPED_FILE_TOOL_NAMES],
    customTools: makeClampedFileTools(ws),
  });

  // The session's registered "read" is OURS: an absolute path outside the
  // workspace throws instead of returning file contents.
  const read = session.getToolDefinition("read");
  if (!read) throw new Error("read tool not registered in session");
  await expect(
    read.execute(
      "t1",
      { path: join(base, "auth.json") } as never,
      undefined,
      undefined,
      {} as never,
    ),
  ).rejects.toThrow("outside the agent workspace");

  // ...while a normal workspace read still works end to end.
  const ok = await read.execute(
    "t2",
    { path: "in.txt" } as never,
    undefined,
    undefined,
    {} as never,
  );
  expect(JSON.stringify(ok.content)).toContain("inside the workspace");

  // Every clamped tool is the registered one, and bash is absent entirely.
  for (const name of CLAMPED_FILE_TOOL_NAMES) {
    expect(session.getToolDefinition(name)).toBeDefined();
  }
  expect(session.getToolDefinition("bash")).toBeUndefined();
});
