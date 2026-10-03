import type { WireFrame } from "@houston/runtime-client";
import {
  type newUsedTokenCapture,
  runWithUsedTokenCapture,
} from "../auth/used-token";
import type { HarnessSession } from "../backends/types";
import {
  type newInteractionHolder,
  runWithInteractionCapture,
} from "../session/interaction";
import { collectTurnFrames, type TurnFrames } from "./turn-session-frames";
import type { TurnSessionRequest } from "./turn-session-types";
import { guardTurnStall } from "./turn-stall-guard";

/**
 * Run the turn's prompt to its end: frames collected and forwarded, the
 * user's cancel wired to the session, and the stall watchdog armed for the
 * model round-trip (turn-stall-guard.ts). A turn the watchdog cut settles on
 * the typed card for its trip in `frames.providerError`.
 */
export async function promptTurnSession(input: {
  session: HarnessSession;
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
  // A cancel that landed while the session was opening (or compacting) would
  // never fire the listener below: the prompt must not start at all.
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
    stall.admit,
  );
  const onAbort = () => void session.abort();
  turn.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    // The used-token capture spans the prompt so the streamed error path
    // (pi/wire.ts) reads THIS turn's seeded token when it reports.
    if (turn.timings) turn.timings.t_prompt_start = performance.now();
    stall.arm();
    await runWithInteractionCapture(input.interaction, () =>
      runWithUsedTokenCapture(input.usedTokens, () =>
        session.prompt(input.prompt),
      ),
    ).catch((error: unknown) => {
      // A prompt that throws after the watchdog cut it is that abort's
      // echo: the turn settles on the stall card below instead.
      if (!stall.stalled()) throw error;
    });
  } finally {
    stall.disarm();
    turn.signal?.removeEventListener("abort", onAbort);
    unsubscribe();
  }
  // A user's cancel wins over the watchdog: the claim's release is that
  // turn's terminal surface, and a stall card on top would double-settle it.
  if (stall.stalled() && !frames.providerError && !turn.signal?.aborted) {
    frames.providerError = stall.failure(turn.provider);
    emit({ type: "provider_error", data: frames.providerError });
  }
}
