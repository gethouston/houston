import type { HoustonEngineClient } from "@houston/runtime-client";
import { streamEventsResumable } from "@houston/runtime-client";
import {
  type BoardStatus,
  feed,
  persistBoardStatus,
  sessionStatus,
} from "./feed-events";
import {
  type ActiveStream,
  deleteStream,
  getStream,
  releaseStream,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  type StreamTuning,
  setStream,
  streamKey,
} from "./stream-registry";
import { turnErrorMessage } from "./translate";
import { TurnSink } from "./turn-sink";

export { observeConversation } from "./observe-stream";
export { disposeAllStreams, type StreamTuning } from "./stream-registry";

/**
 * Run one turn against the new engine and translate its events into the old
 * engine's `FeedItem` + `SessionStatus` bus events.
 *
 * Subscribe FIRST (so the terminal frame can't be missed), then trigger the
 * turn (`sendMessage` with a nonce; its `user` echo names our turnId). The
 * subscription is RESUMABLE: a dropped or idle connection silently reconnects
 * with `?after=<last seq>` and replays the gap, so a transport close never
 * settles the turn. The turn settles ONLY on a terminal frame for OUR turn, on
 * a sync/frame that proves our turn ended while we were away (then from
 * persisted history, by turnId), on a rejected send, on a fatal (401/403/404/
 * 410) stream refusal, or after `STREAM_FAILURE_BUDGET` dead reconnects —
 * never from partial text on a silent close.
 *
 * When a live observer holds the conversation, the send goes FIRST and the
 * observer keeps rendering until it is accepted: a 202 disposes the observer
 * and the turn stream resumes from the observer's cursor (so no frame — our
 * `user` echo included — is lost); a rejected send (e.g. the cloud's one-turn
 * gate answering 409 while the observed turn runs) leaves the observer
 * rendering and surfaces the refusal as a system message WITHOUT settling the
 * conversation as an error — a turn is demonstrably running and its card must
 * stay running.
 */
export async function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  setActivityStatus: (status: BoardStatus) => Promise<void>,
  tuning?: StreamTuning,
): Promise<void> {
  sessionStatus(agentPath, sessionKey, "running");
  // Flip the card to "running" for this turn (re-running a needs_you/done
  // activity must reset it). Fire concurrently so it never delays turn start;
  // persistBoardStatus surfaces its own failure.
  void persistBoardStatus(agentPath, sessionKey, setActivityStatus, "running");

  const key = streamKey(agentPath, sessionKey);
  const nonce = crypto.randomUUID();
  const prior = getStream(key);
  // A previous turn's stream must be disposed (aborted), never silently
  // overwritten — two live turn subscriptions would render frames twice.
  if (prior?.kind === "turn") {
    prior.dispose();
    deleteStream(key);
  }

  // Observer→turn handoff. The cursor snapshot happens BEFORE the send so the
  // resumed stream replays everything from that point — our `user` echo (the
  // turnId source) included, even if the observer consumed it before disposal.
  let after: number | undefined;
  let sent = false;
  if (prior?.kind === "observer") {
    after = prior.lastSeq;
    try {
      await engine.sendMessage(sessionKey, prompt, { nonce });
    } catch (e) {
      feed(agentPath, sessionKey, {
        feed_type: "system_message",
        data: turnErrorMessage(e),
      });
      return; // the observer keeps rendering the running turn
    }
    sent = true;
    prior.dispose();
    deleteStream(key);
  }

  const ac = new AbortController();
  const entry: ActiveStream = { kind: "turn", dispose: () => ac.abort() };
  setStream(key, entry);

  const sink = new TurnSink({
    agentPath,
    sessionKey,
    mode: "turn",
    nonce,
    stop: () => ac.abort(),
    reloadHistory: async () => (await engine.getHistory(sessionKey)).messages,
    // LEGACY fallback (no turn ids anywhere): trust history's trailing reply
    // only when the newest user message is THIS turn's prompt — known weak
    // against two identical prompts in a row; turnId matching replaces it.
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content === prompt,
  });
  if (sent) sink.sendAccepted();

  try {
    const streaming = streamEventsResumable(engine, sessionKey, {
      signal: ac.signal,
      after,
      onEvent: (f) => {
        if (typeof f.seq === "number") entry.lastSeq = f.seq;
        sink.onFrame(f);
      },
      onRetry: ({ consecutiveFailures, error }) => {
        if (consecutiveFailures < STREAM_FAILURE_BUDGET) return;
        // The engine has been unreachable for the whole budget: settle with
        // the real reason (old dead-server UX) instead of spinning forever.
        sink.fail(
          error === undefined ? STREAM_LOST_MESSAGE : turnErrorMessage(error),
        );
        ac.abort();
      },
      ...tuning,
    });
    // Observe settlement even on the early-exit path (send rejected before
    // `await streaming`) so nothing becomes an unhandled rejection.
    streaming.catch(() => {});
    if (!sent) {
      await engine.sendMessage(sessionKey, prompt, { nonce });
      sink.sendAccepted();
    }
    await streaming; // resolves only once the sink settled and aborted
  } catch (e) {
    // A rejected send (e.g. the runtime refusing a not-connected turn with
    // 409), a fatal stream refusal (FatalResumeError), or a throwing frame
    // handler: settle with the engine's plain message so the spinner stops
    // and the reason surfaces.
    if (!sink.settled) sink.fail(turnErrorMessage(e));
  } finally {
    ac.abort();
    releaseStream(key, entry);
  }

  // Persist the terminal board status once the turn settled — awaited, through
  // the cloud-aware seam, so the card actually leaves "running" on the surface
  // the board reads. An externally disposed stream (logout teardown) settles
  // nothing and persists nothing: the client is gone.
  if (sink.terminal)
    await persistBoardStatus(
      agentPath,
      sessionKey,
      setActivityStatus,
      sink.terminal,
    );
}
