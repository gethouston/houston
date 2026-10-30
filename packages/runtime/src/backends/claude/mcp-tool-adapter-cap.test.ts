import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { afterEach, beforeEach, expect, test } from "vitest";
import { adaptTool, type BridgedPiTool } from "./mcp-tool-adapter";

let workspaceDir: string;
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "mcp-cap-"));
});
afterEach(() => rmSync(workspaceDir, { recursive: true, force: true }));

function returning(name: string, text: string): BridgedPiTool {
  return {
    name,
    description: name,
    parameters: Type.Object({}),
    execute: async () => ({ content: [{ type: "text", text }], details: {} }),
  };
}

const firstText = (result: { content: { type: string; text?: string }[] }) =>
  result.content[0]?.text ?? "";

test("an oversized app result reaches Claude as its head and the file holding all of it", async () => {
  const full = "row ".repeat(16_000);
  const spill = { workspaceDir, conversationId: "c1" };
  const result = await adaptTool(
    returning("integration_execute", full),
    spill,
  ).handler({}, {});

  const text = firstText(result);
  expect(text.startsWith(full.slice(0, 20_000))).toBe(true);
  expect(text).toContain("This result is 64,000 characters");
  const path = /saved at (\S+) \(/.exec(text)?.[1] ?? "";
  expect(path).toMatch(/^\.tool-results\/c1\/integration_execute-/);
  expect(readFileSync(join(workspaceDir, path), "utf8")).toBe(full);
});

test("a result under the cap, or from a tool that is not capped, is untouched", async () => {
  const spill = { workspaceDir, conversationId: "c1" };
  const small = "ok ".repeat(5_000);
  expect(
    firstText(
      await adaptTool(returning("houston_call", small), spill).handler({}, {}),
    ),
  ).toBe(small);
  const askUser = "q ".repeat(20_000);
  expect(
    firstText(
      await adaptTool(returning("ask_user", askUser), spill).handler({}, {}),
    ),
  ).toBe(askUser);
});
