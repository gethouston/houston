import { afterEach, expect, test } from "vitest";
import { liveTurns } from "./live-turn";

/**
 * The host's own answer to "what is this agent working on, and in which mode".
 * Two decisions read it and neither may be answered by the runtime it is about:
 * the mission depth chain (missions-start.ts) and the assistant's plan gate
 * (assistant-operate.ts).
 */

const AGENT = "ws/Dobby";

afterEach(() => {
  liveTurns.forget(AGENT);
  liveTurns.forget("ws/Other");
});

test("an agent has no turn until one starts", () => {
  expect(liveTurns.get(AGENT)).toBeUndefined();
});

test("the newest turn replaces the one before it", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.start(AGENT, "conv-2", "execute");
  expect(liveTurns.get(AGENT)).toEqual({
    conversationId: "conv-2",
    mode: "execute",
  });
});

test("a mode switch applies only to the conversation it names", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.setMode(AGENT, "conv-2", "execute");
  expect(liveTurns.get(AGENT)?.mode).toBe("plan");
  liveTurns.setMode(AGENT, "conv-1", "execute");
  expect(liveTurns.get(AGENT)?.mode).toBe("execute");
});

test("agents keep their own records", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.start("ws/Other", "conv-9", "execute");
  expect(liveTurns.get(AGENT)?.conversationId).toBe("conv-1");
  expect(liveTurns.get("ws/Other")?.conversationId).toBe("conv-9");
});

test("a mode switch for an agent with no turn records nothing", () => {
  liveTurns.setMode(AGENT, "conv-1", "plan");
  expect(liveTurns.get(AGENT)).toBeUndefined();
});
