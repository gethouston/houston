import type { WireFrame } from "@houston/runtime-client";
import {
  type newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import type { HarnessSession } from "../backends/types";
import { recoverFollowUpActions } from "../session/follow-up-pass";
import {
  type newInteractionHolder,
  runWithInteractionCapture,
} from "../session/interaction";
import { collectModelCalls } from "../session/model-call-report";
import { collectTurnFrames, type TurnFrames } from "./turn-session-frames";
import type { TurnSessionRequest } from "./turn-session-types";
import { guardTurnStall } from "./turn-stall-guard";

export async function promptTurnSession(input: {
  session: HarnessSession;
  backendId: string;
  turn: TurnSessionRequest;
  prompt: string;
  frames: TurnFrames;
  interaction: ReturnType<typeof newInteractionHolder>;
  usedTokens: ReturnType<typeof newUsedTokenCapture>;
  stallTimeoutMs: number;
  firstByteDeadlineMs: number;
  emit: (frame: WireFrame) => void;
}): Promise<void> {
  const { session, turn, frames, emit } = input;
  turn.signal?.throwIfAborted();
  const stall = guardTurnStall({
    session,
    timeoutMs: input.stallTimeoutMs,
    firstByteDeadlineMs: input.firstByteDeadlineMs,
    conversationId: turn.conversationId,
    turnId: turn.turnId,
  });
  const unsubscribe = collectTurnFrames(
    session,
    frames,
    input.interaction,
    turn.timings,
    emit,
    (wire) =>
      !(wire.type === "provider_error" && turn.stopReason?.()) &&
      stall.admit(wire),
  );
  const modelCalls = collectModelCalls(session, input.backendId);
  frames.modelCalls = modelCalls;
  const onAbort = () => void session.abort();
  turn.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (turn.timings) turn.timings.t_prompt_start = performance.now();
    stall.arm();
    await runWithInteractionCapture(input.interaction, () =>
      runWithUsedTokenCapture(input.usedTokens, () =>
        session.prompt(input.prompt),
      ),
    ).catch((error: unknown) => {
      if (!stall.stalled()) throw error;
    });
    frames.stopReason = turn.stopReason?.();
    stall.disarm();
    await recoverFollowUpActions({
      session,
      interaction: input.interaction,
      conversationId: turn.conversationId,
      turnId: turn.turnId,
      planMode: turn.mode === "plan" || turn.liveMode?.current === "plan",
      assistantText: frames.assistantText,
      userText: turn.text,
      nextStepSuggestions: turn.nextStepSuggestions,
      failed:
        Boolean(frames.providerError) ||
        stall.stalled() ||
        turn.signal?.aborted === true,
      isStopped: () => turn.signal?.aborted === true,
    });
  } finally {
    stall.disarm();
    turn.signal?.removeEventListener("abort", onAbort);
    unsubscribe();
    modelCalls.stop();
  }
  if (stall.stalled() && !frames.providerError && !turn.signal?.aborted) {
    frames.providerError = stall.failure(turn.provider);
    emit({ type: "provider_error", data: frames.providerError });
  }
}
