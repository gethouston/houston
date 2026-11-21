import {
  MODEL_CALL_REPORT_MAX_CALLS,
  type ModelCallBackend,
  type ModelCallReport,
  type ModelCallStartupStep,
  type ModelCallTiming,
} from "@houston/protocol";
import type { HarnessSession } from "../backends/types";

export interface TurnStartupMarks {
  sessionBuildMs: number;
  queuedAt: number;
}

export interface ModelCallCollector {
  noteStartup(step: ModelCallStartupStep, ms: number): void;
  stop(): void;
  report(turnId: string): ModelCallReport | undefined;
}

export function reportBackend(backendId: string): ModelCallBackend {
  return backendId === "pi" ? "pi" : "claude";
}

export function collectModelCalls(
  session: HarnessSession,
  backendId: string,
): ModelCallCollector {
  const backend = reportBackend(backendId);
  const calls: ModelCallTiming[] = [];
  const startupMs: ModelCallReport["startupMs"] = {};
  let dropped = 0;
  let unsubscribe = session.subscribeModelCalls?.((event) => {
    if (event.type === "harness_init") startupMs.harness_init = event.ms;
    else if (calls.length < MODEL_CALL_REPORT_MAX_CALLS) calls.push(event.call);
    else dropped++;
  });
  const supported = unsubscribe !== undefined;
  return {
    noteStartup(step, ms) {
      startupMs[step] = Math.max(0, Math.round(ms));
    },
    stop() {
      unsubscribe?.();
      unsubscribe = undefined;
    },
    report(turnId) {
      if (!supported) return undefined;
      return {
        v: 1,
        turnId,
        backend,
        startupMs: { ...startupMs },
        calls: [...calls],
        droppedCalls: dropped,
      };
    },
  };
}

export function collectStandingTurnCalls(
  session: HarnessSession,
  backendId: string,
  enteredAt: number,
  startup: TurnStartupMarks | undefined,
): ModelCallCollector & { notePrompt(): void } {
  const collector = collectModelCalls(session, backendId);
  if (startup) {
    collector.noteStartup("session_build", startup.sessionBuildMs);
    collector.noteStartup("queue_wait", enteredAt - startup.queuedAt);
  }
  return {
    ...collector,
    notePrompt: () =>
      collector.noteStartup("pre_prompt", performance.now() - enteredAt),
  };
}
