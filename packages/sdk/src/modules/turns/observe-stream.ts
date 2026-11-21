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
