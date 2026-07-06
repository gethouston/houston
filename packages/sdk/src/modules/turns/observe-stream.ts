import type { HoustonEngineClient } from "@houston/runtime-client";
import {
  FatalResumeError,
  streamEventsResumable,
} from "@houston/runtime-client";
import type { FeedOutput } from "./feed-output";
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
 * stream — the reload-mid-turn fix. Opened when a chat's history loads: if the
 * server's `sync` reports a turn in flight, surface it (running indicator +
 * partial text) and render live frames to completion, settling exactly like a
 * turn we sent; if the conversation is idle, the stream closes immediately.
 * No-op when the conversation is already streamed (live turn or observer).
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
  /** History length at open — the LEGACY (no turn ids) settle guard. */
  messagesAtOpen: number,
  /** The caller's stream set (one per SDK / adapter). */
  registry: StreamRegistry,
  tuning?: StreamTuning,
): void {
  const key = streamKey(agentPath, sessionKey);
  if (registry.get(key)) return;
  const ac = new AbortController();
  const entry: ActiveStream = { kind: "observer", dispose: () => ac.abort() };
  registry.set(key, entry);

  const sink = new TurnSink({
    agentPath,
    sessionKey,
    output,
    mode: "observer",
    stop: () => ac.abort(),
    reloadHistory: async () => (await engine.getHistory(sessionKey)).messages,
    // LEGACY fallback (no turn ids anywhere): trust history's trailing reply
    // only if something was persisted since we opened — i.e. the observed
    // turn actually ended, not a previous turn. turnId matching replaces it.
    historyGuard: (messages) => messages.length > messagesAtOpen,
  });

  void (async () => {
    let exhausted = false;
    try {
      await streamEventsResumable(engine, sessionKey, {
        signal: ac.signal,
        onEvent: (f) => {
          if (typeof f.seq === "number") entry.lastSeq = f.seq;
          sink.onFrame(f);
        },
        onRetry: ({ consecutiveFailures }) => {
          // Budget exhausted: nothing to keep alive. A mid-render card is
          // settled below via the sink; an idle attach just goes away.
          if (consecutiveFailures >= STREAM_FAILURE_BUDGET) {
            exhausted = true;
            ac.abort();
          }
        },
        ...tuning,
      });
      if (exhausted && sink.active && !sink.settled) {
        // The budget ended a mid-render observation: the observed card must
        // never freeze in "running". (An external dispose — logout teardown —
        // settles nothing: the client is going away with the UI.)
        sink.fail(STREAM_LOST_MESSAGE);
      }
    } catch (e) {
      if (sink.active && !sink.settled) {
        // Mid-turn the observed card would freeze — settle it visibly.
        sink.fail(turnErrorMessage(e));
      } else if (!(e instanceof FatalResumeError)) {
        // A throwing frame handler is a bug: surface it on the conversation's
        // feed (the standard error path — never log-only).
        output.pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: `Conversation observer failed: ${turnErrorMessage(e)}`,
        });
      }
      // A fatal refusal with nothing rendered: dispose silently — a passive
      // attach to a gone/forbidden conversation has nothing to report.
    } finally {
      registry.release(key, entry);
    }
    if (sink.terminal)
      await output.persistBoardStatus(
        agentPath,
        sessionKey,
        sink.terminal,
        sink.terminalInteraction,
      );
  })();
}
