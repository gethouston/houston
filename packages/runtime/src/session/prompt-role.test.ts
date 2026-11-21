import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildSystemPrompt } from "../backends/claude/system-prompt";
import { makeAgentLoader } from "./resource-loader";

const MANAGER = "You are Houston, the user's AI Manager";
const workspace = () => mkdtempSync(join(tmpdir(), "prompt-role-"));

test("the Claude prompt carries the manager's rules for a coordinator turn only", () => {
  const dir = workspace();
  expect(
    buildSystemPrompt(dir, "base", undefined, undefined, "coordinator"),
  ).toContain(MANAGER);
  expect(
    buildSystemPrompt(dir, "base", undefined, undefined, null),
  ).not.toContain(MANAGER);
});

test("the pi prompt carries the manager's rules for a coordinator turn only", async () => {
  const dir = workspace();
  const manager = makeAgentLoader(
    dir,
    undefined,
    undefined,
    "base",
    undefined,
    "coordinator",
  );
  const agent = makeAgentLoader(
    dir,
    undefined,
    undefined,
    "base",
    undefined,
    null,
  );
  await manager.reload();
  await agent.reload();
  expect(manager.getSystemPrompt()).toContain(MANAGER);
  expect(agent.getSystemPrompt()).not.toContain(MANAGER);
});
