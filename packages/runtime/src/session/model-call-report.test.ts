import {
  MODEL_CALL_REPORT_MAX_CALLS,
  type ModelCallTiming,
} from "@houston/protocol";
import { expect, test } from "vitest";
import type { HarnessSession, HarnessTimingEvent } from "../backends/types";
import { collectModelCalls } from "./model-call-report";

const call: ModelCallTiming = {
  provider: "openai-codex",
  model: "gpt-6-luna",
  ttfbMs: 900,
  inputTokens: 100,
  cacheReadTokens: 4000,
  cacheWriteTokens: 0,
  outputTokens: 20,
};

/** A session whose timing feed the test drives by hand. */
function fakeSession(withTimings = true) {
  const listeners = new Set<(e: HarnessTimingEvent) => void>();
  const session = (withTimings
    ? {
        subscribeModelCalls(l: (e: HarnessTimingEvent) => void) {
          listeners.add(l);
          return () => listeners.delete(l);
        },
      }
    : {}) as unknown as HarnessSession;
  const emit = (e: HarnessTimingEvent) => {
    for (const l of listeners) l(e);
  };
  return { session, emit, listeners };
}

test("collects calls, the latest harness init and the turn's own startup", () => {
  const { session, emit } = fakeSession();
  const collector = collectModelCalls(session, "anthropic");
  emit({ type: "harness_init", ms: 1900 });
  emit({ type: "harness_init", ms: 700 });
  emit({ type: "call", call });
  collector.noteStartup("pre_prompt", 41.6);
  expect(collector.report("turn-1")).toEqual({
    v: 1,
    turnId: "turn-1",
    backend: "claude",
    startupMs: { harness_init: 700, pre_prompt: 42 },
    calls: [call],
    droppedCalls: 0,
  });
});

test("stop detaches; calls past the cap are counted", () => {
  const { session, emit, listeners } = fakeSession();
  const collector = collectModelCalls(session, "pi");
  for (let i = 0; i < MODEL_CALL_REPORT_MAX_CALLS + 2; i++)
    emit({ type: "call", call });
  collector.stop();
  collector.stop();
  expect(listeners.size).toBe(0);
  emit({ type: "call", call });
  const report = collector.report("turn-2");
  expect(report?.backend).toBe("pi");
  expect(report?.calls).toHaveLength(MODEL_CALL_REPORT_MAX_CALLS);
  expect(report?.droppedCalls).toBe(2);
});

test("a session without a timing feed reports nothing", () => {
  const collector = collectModelCalls(fakeSession(false).session, "pi");
  collector.noteStartup("pre_prompt", 5);
  expect(collector.report("turn-3")).toBeUndefined();
});
