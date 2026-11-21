import {
  type GrantableOperation,
  isAutoContinue,
  type MessageApproval,
} from "@houston/protocol";
import type { HoustonEngineClient } from "@houston/runtime-client";
import { streamEventsResumable } from "@houston/runtime-client";
import { TurnBoardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import { FirstResponseClock } from "./first-response";
import type { PersonStop } from "./person-stop";
import { randomNonce } from "./random-nonce";
import { computeBusyRefusal } from "./send-busy";
import { observerSettled } from "./send-hold";
import {
  duplicateSendItem,
  refusedResendItem,
  settleRefusedSend,
} from "./send-refusal-item";
import { armHandoffStop, sendUntilAccepted } from "./send-wait";
import {
  type ActiveStream,
  PRESETTLED_POLL_MS,
  SEND_LOST_MESSAGE,
  SEND_VERDICT_MS,
  STREAM_FAILURE_BUDGET,
  STREAM_LOST_MESSAGE,
  type StreamRegistry,
  type StreamTuning,
  streamKey,
} from "./stream-registry";
import {
  engineVerdictMessage,
  isAmbiguousSendFailure,
  STOPPED_BY_USER,
} from "./turn-errors";
import { isTurnRunningRejection } from "./turn-running";
import { TurnSink } from "./turn-sink";
import type { FeedAuthor, FeedMention } from "./vm-output";

export { observeConversation } from "./observe-stream";
export type { StreamRegistry, StreamTuning } from "./stream-registry";

export interface TurnWirePin {
  provider?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
}

export interface StreamTurnOptions {
  nonce?: string;
  provider?: string;
  pin?: TurnWirePin;
  tuning?: StreamTuning;
  suppressUserBubble?: boolean;
  displayText?: string;
  author?: FeedAuthor;
  mentions?: FeedMention[];
  approvals?: MessageApproval[];
  missionTitle?: { fallback: string; text: string };
  grants?: GrantableOperation[];
  onAccepted?: () => void;
}

export async function streamTurn(
  engine: HoustonEngineClient,
  agentPath: string,
  sessionKey: string,
  prompt: string,
  output: FeedOutput,
  registry: StreamRegistry,
  opts: StreamTurnOptions = {},
): Promise<void> {
  const firstResponse = new FirstResponseClock(
    (response) => output.firstResponse?.(agentPath, sessionKey, response),
    opts.tuning?.firstResponseTimeoutMs,
  );
  const key = registry.noteTurnStart(streamKey(agentPath, sessionKey));
  output.sessionStatus(agentPath, sessionKey, "running");
  const mentions = opts.mentions?.length ? opts.mentions : undefined;
  if (!opts.suppressUserBubble && !isAutoContinue(prompt)) {
    output.pushFeedItem(agentPath, sessionKey, {
      feed_type: "user_message",
      data: opts.displayText ?? prompt,
      pending: true,
      author: opts.author,
      mentions,
    });
  }
  const board = new TurnBoardWrites(output, agentPath, sessionKey);
  void board.persist("running", null, { stamp: "last_message" });

  const nonce = opts.nonce ?? randomNonce();
  const prior = registry.get(key);
  if (prior?.kind === "turn") {
    prior.dispose();
    registry.delete(key);
  }

  const sendOptions = {
    nonce,
    ...opts.pin,
    displayText: opts.displayText,
    mentions,
    approvals: opts.approvals,
    missionTitle: opts.missionTitle,
    grants: opts.grants,
  };
  let after: number | undefined;
  let sent = false;
  let handoffRefusal: unknown;
  let handoffSentAt: number | undefined;
  let stoppedBeforeSend: PersonStop | undefined;
  const refuseDuplicate = () => {
    output.pushFeedItem(agentPath, sessionKey, duplicateSendItem);
    firstResponse.resolve("error");
  };
  if (prior?.kind !== "observer" && registry.isSending(key)) {
    refuseDuplicate();
    return;
  }
  if (prior?.kind === "observer") {
    if (!registry.beginSend(key)) {
      refuseDuplicate();
      return;
    }
    after = prior.lastSeq;
    const handoffStop = armHandoffStop(registry, key, () => prior.dispose());
    let refusal: unknown;
    const sentAt = Date.now();
    try {
      await engine.sendMessage(sessionKey, prompt, {
        ...sendOptions,
        signal: handoffStop.signal,
      });
      sent = true;
    } catch (e) {
      refusal = e;
    }
    const settledBehind =
      !sent &&
      isTurnRunningRejection(refusal) &&
      handoffStop.stopped() === undefined &&
      (await observerSettled(
        registry,
        key,
        prior,
        opts.tuning,
        handoffStop.signal,
      ));
    stoppedBeforeSend = handoffStop.stopped();
    if (stoppedBeforeSend) sent = false;
    handoffStop.disarm();
    if (sent) {
      if (registry.get(key) !== prior) firstResponse.dispose();
      prior.dispose();
      registry.delete(key);
    } else if (stoppedBeforeSend || computeBusyRefusal(refusal)) {
      if (!stoppedBeforeSend) {
        handoffRefusal = refusal;
        handoffSentAt = sentAt;
      }
      if (!registry.isSending(key)) {
        firstResponse.dispose();
        return;
      }
      const current = registry.get(key);
      if (current?.kind === "observer") {
        current.dispose();
        registry.delete(key);
      }
    } else if (settledBehind) {
      if (!registry.isSending(key)) {
        firstResponse.dispose();
        return;
      }
      const next = registry.get(key);
      if (next?.kind === "observer") {
        next.dispose();
        registry.delete(key);
      }
      after = prior.lastSeq;
    } else {
      const e = refusal;
      if (registry.get(key) !== prior) firstResponse.dispose();
      registry.endSend(key);
      output.pushFeedItem(agentPath, sessionKey, refusedResendItem(e));
      firstResponse.resolve("error");
      return;
    }
  }

  const ac = new AbortController();
  const entry: ActiveStream = {
    kind: "turn",
    accepted: sent,
    dispose: () => {
      firstResponse.dispose();
      ac.abort();
    },
  };
  registry.set(key, entry);
  registry.endSend(key);
  if (prior?.kind === "observer")
    output.sessionStatus(agentPath, sessionKey, "running");

  const sink = new TurnSink({
    agentPath,
    sessionKey,
    output,
    mode: "turn",
    nonce,
    provider: opts.provider,
    prompt,
    stop: () => ac.abort(),
    reloadHistory: async () => (await engine.getHistory(sessionKey)).messages,
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content === prompt,
    presettledPollMs: opts.tuning?.presettledPollMs ?? PRESETTLED_POLL_MS,
    firstResponse,
    board,
  });
  let acceptedOnce = false;
  const noteAccepted = () => {
    if (acceptedOnce) return;
    acceptedOnce = true;
    opts.onAccepted?.();
  };
  if (sent) {
    sink.sendAccepted();
    noteAccepted();
  }
  sink.whenStarted(noteAccepted);
  ac.signal.addEventListener("abort", () => sink.dispose(), { once: true });

  let sendVerdict: ReturnType<typeof setTimeout> | undefined;
  let sendOut = !sent;
  let spentUnsent = 0;
  try {
    const streaming = stoppedBeforeSend
      ? Promise.resolve()
      : streamEventsResumable(engine, sessionKey, {
          signal: ac.signal,
          after,
          onEvent: (f) => {
            spentUnsent = 0;
            if (typeof f.seq === "number") entry.lastSeq = f.seq;
            sink.onFrame(f);
          },
          onRetry: ({ consecutiveFailures, error }) => {
            if (sendOut) {
              spentUnsent = consecutiveFailures;
              return;
            }
            if (consecutiveFailures - spentUnsent < STREAM_FAILURE_BUDGET)
              return;
            sink.fail(engineVerdictMessage(error) ?? STREAM_LOST_MESSAGE);
            ac.abort();
          },
          ...opts.tuning,
        });
    streaming.catch(() => {});
    if (stoppedBeforeSend) {
      const stopped = stoppedBeforeSend;
      entry.held = true;
      entry.stopUnsent = () => stopped.join();
      await stopped.settleWith(() => {
        if (!ac.signal.aborted) sink.fail(STOPPED_BY_USER);
      });
      ac.abort();
    } else if (!sent) {
      try {
        const accepted = await sendUntilAccepted({
          send: (signal) =>
            engine.sendMessage(sessionKey, prompt, { ...sendOptions, signal }),
          sink,
          entry,
          ac,
          tuning: opts.tuning,
          output,
          agentPath,
          sessionKey,
          firstRefusal: handoffRefusal,
          firstSentAt: handoffSentAt,
        });
        sendOut = false;
        sink.sendAccepted(accepted.turnId);
        noteAccepted();
      } catch (e) {
        sendOut = false;
        if (!isAmbiguousSendFailure(e)) throw e;
        sink.sendMaybeAccepted();
        sendVerdict = setTimeout(() => {
          if (sink.failUnlessStarted(SEND_LOST_MESSAGE)) ac.abort();
        }, opts.tuning?.sendVerdictMs ?? SEND_VERDICT_MS);
      }
    }
    await streaming;
  } catch (e) {
    if (!sink.settled && !ac.signal.aborted) settleRefusedSend(sink, e);
  } finally {
    if (sendVerdict !== undefined) clearTimeout(sendVerdict);
    sink.dispose();
    firstResponse.dispose();
    ac.abort();
    registry.release(key, entry);
  }

  await board.settled;
}
