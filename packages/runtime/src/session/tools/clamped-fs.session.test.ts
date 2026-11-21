import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getModel } from "@earendil-works/pi-ai/compat";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { CLAMPED_FILE_TOOL_NAMES, makeClampedFileTools } from "./clamped-fs";

const base = mkdtempSync(join(tmpdir(), "houston-shadow-"));
const ws = join(base, "workspace");
const agentDir = join(base, "agent");
mkdirSync(ws);
mkdirSync(agentDir);
writeFileSync(join(ws, "in.txt"), "inside the workspace");
writeFileSync(join(base, "auth.json"), JSON.stringify({ secret: true }));

test("clamped tools shadow pi builtins inside a real AgentSession", async () => {
  const { session } = await createAgentSession({
    cwd: ws,
    agentDir,
    modelRuntime: await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
    }),
    model: getModel("anthropic", "claude-sonnet-4-5") as never,
    sessionManager: SessionManager.inMemory(),
    tools: [...CLAMPED_FILE_TOOL_NAMES],
    customTools: makeClampedFileTools(ws),
  });

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

  const ok = await read.execute(
    "t2",
    { path: "in.txt" } as never,
    undefined,
    undefined,
    {} as never,
  );
  expect(JSON.stringify(ok.content)).toContain("inside the workspace");

  for (const name of CLAMPED_FILE_TOOL_NAMES) {
    expect(session.getToolDefinition(name)).toBeDefined();
  }
  expect(session.getToolDefinition("bash")).toBeUndefined();
});
