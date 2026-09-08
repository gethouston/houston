import { afterEach, expect, test } from "vitest";
import { liveTurns } from "./live-turn";

/**
 * The host's own answer to "what is this agent working on, in which mode, and
 * in whose name". Three decisions read it and none may be answered by the
 * runtime they are about: the mission depth chain (missions-start.ts), the plan
 * gate (plan-gate.ts) and the acting identity a mission or a learning is
 * written under (missions-sandbox.ts, learnings-sandbox.ts).
 */

const AGENT = "ws/Dobby";

afterEach(() => {
  liveTurns.forget(AGENT);
  liveTurns.forget("ws/Other");
});

test("an agent has no turn until one starts", () => {
  expect(liveTurns.get(AGENT, "conv-1")).toBeUndefined();
});

test("two conversations keep their own mode and lineage", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.start(AGENT, "conv-2", "execute");
  expect(liveTurns.get(AGENT, "conv-1")).toEqual({
    conversationId: "conv-1",
    mode: "plan",
  });
  expect(liveTurns.get(AGENT, "conv-2")).toEqual({
    conversationId: "conv-2",
    mode: "execute",
  });
});

test("a mode switch applies only to the conversation it names", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.setMode(AGENT, "conv-2", "execute");
  expect(liveTurns.get(AGENT, "conv-1")?.mode).toBe("plan");
  liveTurns.setMode(AGENT, "conv-1", "execute");
  expect(liveTurns.get(AGENT, "conv-1")?.mode).toBe("execute");
});

test("agents keep their own records", () => {
  liveTurns.start(AGENT, "conv-1", "plan");
  liveTurns.start("ws/Other", "conv-9", "execute");
  expect(liveTurns.get(AGENT, "conv-9")).toBeUndefined();
  expect(liveTurns.get("ws/Other", "conv-9")?.conversationId).toBe("conv-9");
});

test("a mode switch for a conversation with no turn records nothing", () => {
  liveTurns.setMode(AGENT, "conv-1", "plan");
  expect(liveTurns.get(AGENT, "conv-1")).toBeUndefined();
});

test("the acting identity rides the turn it was recorded with", () => {
  liveTurns.start(AGENT, "conv-1", "execute", {
    actingAs: "acting-v1.token",
    actingUser: undefined,
  });
  liveTurns.start(AGENT, "conv-2", "execute", { actingUser: "routine-owner" });
  expect(liveTurns.get(AGENT, "conv-1")?.actingAs).toBe("acting-v1.token");
  expect(liveTurns.get(AGENT, "conv-1")?.actingUser).toBeUndefined();
  expect(liveTurns.get(AGENT, "conv-2")?.actingUser).toBe("routine-owner");
});

test("a turn that ended leaves no record behind", () => {
  liveTurns.start(AGENT, "conv-1", "execute");
  liveTurns.start(AGENT, "conv-2", "execute");
  liveTurns.end(AGENT, "conv-1");
  expect(liveTurns.get(AGENT, "conv-1")).toBeUndefined();
  expect(liveTurns.get(AGENT, "conv-2")?.mode).toBe("execute");
});

test("records never accumulate without bound; the oldest is dropped", () => {
  for (let i = 0; i < 40; i++) liveTurns.start(AGENT, `conv-${i}`, "execute");
  expect(liveTurns.get(AGENT, "conv-0")).toBeUndefined();
  expect(liveTurns.get(AGENT, "conv-39")?.conversationId).toBe("conv-39");
});

test("forget drops every conversation of that agent", () => {
  liveTurns.start(AGENT, "conv-1", "execute");
  liveTurns.start(AGENT, "conv-2", "execute");
  liveTurns.forget(AGENT);
  expect(liveTurns.get(AGENT, "conv-1")).toBeUndefined();
  expect(liveTurns.get(AGENT, "conv-2")).toBeUndefined();
});

test("a follow-up send keeps the chat live when the first turn reports its end", () => {
  // The person sent again while the agent was still working: the runtime queues
  // the second message behind the first, so the first turn's end report must
  // not retire the record the second one is running under.
  liveTurns.start(AGENT, "conv-1", "execute", { actingAs: "first" });
  liveTurns.start(AGENT, "conv-1", "plan", { actingAs: "second" });
  liveTurns.end(AGENT, "conv-1");
  expect(liveTurns.get(AGENT, "conv-1")).toMatchObject({
    mode: "plan",
    actingAs: "second",
  });
  liveTurns.end(AGENT, "conv-1");
  expect(liveTurns.get(AGENT, "conv-1")).toBeUndefined();
});

test("an end report for a chat with no record changes nothing", () => {
  liveTurns.start(AGENT, "conv-1", "execute");
  liveTurns.end(AGENT, "conv-2");
  liveTurns.end(AGENT, "conv-2");
  expect(liveTurns.get(AGENT, "conv-1")?.mode).toBe("execute");
});
