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

export interface TurnFrames {
  assistantText: string;
  usage: TokenUsage | null;
  tools: ToolCallRecord[];
  providerError?: ProviderError;
  stopReason?: TurnOutcome["stopReason"];
  modelCalls?: ModelCallCollector;
}

export function newTurnFrames(): TurnFrames {
  return { assistantText: "", usage: null, tools: [] };
}

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

export function modelCallsOutcome(
  frames: TurnFrames,
  turnId: string,
): Pick<TurnOutcome, "modelCalls"> {
  const modelCalls = frames.modelCalls?.report(turnId);
  return modelCalls ? { modelCalls } : {};
}
