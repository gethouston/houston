import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  FatalResumeError,
  streamEventsResumable,
} from "@houston/runtime-client";
import { TurnBoardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import { turnProgressAt } from "./send-hold-clock";
import {
  type ActiveStream,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  type StreamRegistry,
  type StreamTuning,
  streamKey,
} from "./stream-registry";
import { turnErrorMessage } from "./turn-errors";
import { TurnSink } from "./turn-sink";

/**
 * Passively observe a conversation this client did not (or no longer does)
 * stream, such as a turn still running across a reload. Opened when a chat's
 * history loads: if the server's `sync` reports a turn in flight, surface it
 * (running indicator + partial text) and render live frames to completion,
 * settling exactly like a turn we sent; if the conversation is idle, the
 * stream closes immediately. No-op when the conversation is already streamed
 * (live turn or observer).
 *
 * Failure posture: a fatal stream refusal (401/403/404/410) or an exhausted
 * reconnect budget disposes SILENTLY while nothing is mid-render — a passive
 * background attach has nothing user-initiated to surface — but settles the
 * observed card visibly when a turn was already on screen (it must never
 * freeze). A throwing frame handler is a bug and surfaces as a system message.
 */
export function observeConversation(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  output: FeedOutput,
  messagesAtOpen: number,
  registry: StreamRegistry,
  tuning?: StreamTuning,
): void {
  const key = streamKey(agentPath, sessionKey);
  if (registry.get(key)) return;
  const ac = new AbortController();
  const entry: ActiveStream = { kind: "observer", dispose: () => ac.abort() };
  registry.set(key, entry);

  const board = new TurnBoardWrites(
    output,
    agentPath,
    sessionKey,
    undefined,
    "observer",
  );
  const sink = new TurnSink({
    agentPath,
    sessionKey,
    output,
    mode: "observer",
    board,
    stop: () => ac.abort(),
    reloadHistory: async () => (await engine.getHistory(sessionKey)).messages,
    historyGuard: (messages) => messages.length > messagesAtOpen,
  });
  ac.signal.addEventListener("abort", () => sink.dispose(), { once: true });

  void (async () => {
    let exhausted = false;
    try {
      await streamEventsResumable(engine, sessionKey, {
        signal: ac.signal,
        onEvent: (f) => {
          if (typeof f.seq === "number") entry.lastSeq = f.seq;
          entry.lastProgressAt = turnProgressAt(f) ?? entry.lastProgressAt;
          sink.onFrame(f);
        },
        onRetry: ({ consecutiveFailures }) => {
          if (consecutiveFailures >= STREAM_FAILURE_BUDGET) {
            exhausted = true;
            ac.abort();
          }
        },
        ...tuning,
      });
      if (exhausted && sink.active && !sink.settled) {
        sink.fail(STREAM_LOST_MESSAGE);
      }
    } catch (e) {
      if (sink.active && !sink.settled) {
        sink.fail(turnErrorMessage(e));
      } else if (!(e instanceof FatalResumeError)) {
        output.pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: turnErrorMessage(e),
        });
      }
    } finally {
      registry.release(key, entry);
    }
    await board.settled;
  })();
}
