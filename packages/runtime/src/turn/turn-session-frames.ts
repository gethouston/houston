import type {
  ProviderError,
  TokenUsage,
  ToolCallRecord,
  WireEvent,
  WireFrame,
} from "@houston/runtime-client";
import type { HarnessSession } from "../backends/types";
import type { newInteractionHolder } from "../session/interaction";
import type { ModelCallCollector } from "../session/model-call-report";
import { subscribeFinishMarks } from "../session/reply-complete";
import type { TurnOutcome, TurnSessionRequest } from "./turn-session-types";

/** What a pooled turn accumulates from its session's wire stream. */
export interface TurnFrames {
  assistantText: string;
  usage: TokenUsage | null;
  tools: ToolCallRecord[];
  /**
   * A typed provider failure for this turn. pi resolves the turn rather than
   * throwing, so this arrives on the stream (a provider_error frame, emitted
   * to the client like any other) and is persisted on the assistant message
   * so the inline card survives a reload of this cloud conversation.
   */
  providerError?: ProviderError;
  /** Snapshot at loop completion: late durability stops cannot change it. */
  stopReason?: TurnOutcome["stopReason"];
  /** The turn's per-call timings, attached when the prompt starts. */
  modelCalls?: ModelCallCollector;
}

export function newTurnFrames(): TurnFrames {
  return { assistantText: "", usage: null, tools: [] };
}

/**
 * Accumulate `session`'s wire stream into `frames` and forward every frame
 * through `emit`. The interaction holder's finish marks are fed too, so an
 * offer tool can tell whether the closing message is already written, and
 * they decide the turn's `reply_complete` frame (reply-complete.ts). Every
 * event passes `admit` first (the stall guard, turn-stall-guard.ts), which
 * drops the echo of an abort the turn issued itself. Returns the unsubscribe
 * for both subscriptions.
 */
export function collectTurnFrames(
  session: HarnessSession,
  frames: TurnFrames,
  interaction: ReturnType<typeof newInteractionHolder>,
  timings: TurnSessionRequest["timings"],
  emit: (frame: WireFrame) => void,
  admit: (wire: WireEvent) => boolean = () => true,
): () => void {
  const unsubMarks = subscribeFinishMarks(session, interaction.finish, emit);
  const unsub = session.subscribe((wire: WireEvent) => {
    if (!admit(wire)) return;
    // First provider-originated event = the honest first-token bound. Set
    // once; the terminal frame reports it as a delta.
    if (timings && timings.t_first_model_event === undefined)
      timings.t_first_model_event = performance.now();
    if (wire.type === "text") {
      frames.assistantText += wire.data;
      interaction.finish.noteAssistantText(wire.data);
    } else if (wire.type === "usage") frames.usage = wire.data;
    else if (wire.type === "tool_start")
      frames.tools.push({ name: wire.data.name });
    else if (wire.type === "tool_end") {
      const t = frames.tools[frames.tools.length - 1];
      if (t) t.isError = wire.data.isError;
    } else if (wire.type === "provider_error") {
      frames.providerError = wire.data;
    }
    emit(wire);
  });
  return () => {
    unsub();
    unsubMarks();
  };
}

/** The outcome field carrying the frames' model-call report, when any. */
export function modelCallsOutcome(
  frames: TurnFrames,
  turnId: string,
): Pick<TurnOutcome, "modelCalls"> {
  const modelCalls = frames.modelCalls?.report(turnId);
  return modelCalls ? { modelCalls } : {};
}
