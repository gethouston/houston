import type { WireEvent } from "@houston/runtime-client";
import type { HarnessSession } from "../backends/types";
import type { TurnFinishMarks } from "./turn-finish";

export function emitReplyComplete(
  session: HarnessSession,
  finish: TurnFinishMarks,
  emit: (wire: WireEvent) => void,
): (() => void) | undefined {
  return session.subscribeReplyBeats?.((beat) => {
    if (finish.noteReplyBeat(beat))
      emit({ type: "reply_complete", data: null });
  });
}

export function subscribeFinishMarks(
  session: HarnessSession,
  finish: TurnFinishMarks,
  emit: (wire: WireEvent) => void,
  onMessageStart?: () => void,
): () => void {
  const unsubStart = session.subscribeAssistantMessageStart?.(() => {
    finish.noteAssistantMessageStart();
    onMessageStart?.();
  });
  const unsubBeats = emitReplyComplete(session, finish, emit);
  return () => {
    unsubStart?.();
    unsubBeats?.();
  };
}
