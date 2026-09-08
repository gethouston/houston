import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { loggedToolCall, withToolCallLog } from "./tool-call-log";

/**
 * The record of what the assistant actually DID. It is written at INFO because
 * it is the ordinary trace of a working assistant AND the first thing anyone
 * reads after an incident: when a user was told a mission could not be deleted,
 * nothing in the log could say whether the model had searched, called anything,
 * or been refused.
 */

const lines: string[] = [];
const info = vi.spyOn(console, "info").mockImplementation((...values) => {
  lines.push(values.join(" "));
});

afterEach(() => {
  lines.length = 0;
  info.mockClear();
});

const tool = (result: AgentToolResult<unknown>) => ({
  name: "houston_call",
  label: "Do a Houston thing",
  execute: async () => result,
});

test("a success is one line naming the tool and how long it took", async () => {
  const logged = withToolCallLog(tool({ content: [], details: { ok: true } }));
  await logged.execute();
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^\[tool] houston_call \d+ms ok$/);
});

test("a refusal keeps its named code, which is the whole diagnosis", async () => {
  // Every one of these tools reports failures as VALUES, so the code is what
  // says which of "the model addressed it wrong", "the user must decide" and
  // "the server refused" happened.
  const logged = withToolCallLog(
    tool({
      content: [],
      details: {
        ok: false,
        operation: "deleteActivity",
        error: { code: "needs_confirmation" },
      },
    }),
  );
  await logged.execute();
  expect(lines[0]).toContain("houston_call deleteActivity");
  expect(lines[0]).toContain("error needs_confirmation");
});

test("a throw is logged and then rethrown untouched", async () => {
  const boom = new TypeError("no board");
  await expect(
    loggedToolCall("list_missions", () => Promise.reject(boom)),
  ).rejects.toBe(boom);
  expect(lines[0]).toContain("[tool] list_missions");
  expect(lines[0]).toContain("error TypeError");
});

test("the wrapper hands back the same tool, definition and all", async () => {
  const original = {
    ...tool({ content: [{ type: "text", text: "hi" }], details: undefined }),
    description: "the description the model reads",
    executionMode: "parallel" as const,
  };
  const logged = withToolCallLog(original);
  expect(logged.name).toBe(original.name);
  expect(logged.description).toBe(original.description);
  expect(logged.executionMode).toBe("parallel");
  await expect(logged.execute()).resolves.toEqual({
    content: [{ type: "text", text: "hi" }],
    details: undefined,
  });
});

test("a result with no details still reports an outcome", async () => {
  const logged = withToolCallLog(tool({ content: [], details: undefined }));
  await logged.execute();
  expect(lines[0]).toMatch(/ok$/);
});
