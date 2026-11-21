import type { SendAccepted } from "@houston/runtime-client";
import type { FeedOutput } from "./feed-output";
import { PersonStop } from "./person-stop";
import { sendHolding } from "./send-hold";
import type {
  ActiveStream,
  StreamRegistry,
  StreamTuning,
} from "./stream-registry";
import { STOPPED_BY_USER } from "./turn-errors";
import type { TurnSink } from "./turn-sink";

function stoppedError(): Error {
  const e = new Error(STOPPED_BY_USER);
  e.name = "AbortError";
  return e;
}

export interface UnsentTurn {
  send: (signal: AbortSignal) => Promise<SendAccepted | undefined>;
  sink: TurnSink;
  entry: ActiveStream;
  ac: AbortController;
  tuning: StreamTuning | undefined;
  output: FeedOutput;
  agentPath: string;
  sessionKey: string;
  firstRefusal?: unknown;
  firstSentAt?: number;
}

export async function sendUntilAccepted(
  turn: UnsentTurn,
): Promise<SendAccepted> {
  const { sink, entry, ac, output, agentPath, sessionKey } = turn;
  const post = new AbortController();
  const hold = new AbortController();
  const endSend = () => {
    post.abort();
    hold.abort();
  };
  ac.signal.addEventListener("abort", endSend, { once: true });
  let shown = false;
  const showBusy = () => {
    if (ac.signal.aborted || shown || sink.active) return;
    shown = true;
    output.sendWaiting?.(agentPath, sessionKey, "busy");
  };
  const clearBusy = () => {
    if (!shown) return;
    shown = false;
    output.sendWaiting?.(agentPath, sessionKey, null);
  };
  ac.signal.addEventListener("abort", clearBusy, { once: true });
  sink.whenStarted(clearBusy);
  let stop: PersonStop | undefined;
  entry.stopUnsent = () => {
    if (sink.settled) return null;
    if (stop) return stop.join();
    stop = new PersonStop();
    sink.mute();
    entry.held = true;
    endSend();
    return stop.join();
  };
  try {
    const accepted = await sendHolding(
      () => turn.send(post.signal),
      sink,
      hold.signal,
      turn.tuning,
      {
        onHold: () => {
          sink.holdSend();
          entry.held = true;
        },
        onBusy: showBusy,
        firstRefusal: turn.firstRefusal,
        busySince: turn.firstSentAt,
      },
    );
    if (!stop) {
      entry.accepted = true;
      return accepted;
    }
    throw stoppedError();
  } catch (e) {
    if (stop) {
      clearBusy();
      await stop.settleWith(() => {
        if (!ac.signal.aborted) sink.fail(STOPPED_BY_USER);
      });
      ac.abort();
    }
    throw e;
  } finally {
    entry.held = false;
    entry.stopUnsent = undefined;
    ac.signal.removeEventListener("abort", endSend);
    ac.signal.removeEventListener("abort", clearBusy);
    clearBusy();
  }
}

export interface HandoffStop {
  signal: AbortSignal;
  stopped(): PersonStop | undefined;
  disarm(): void;
}

export function armHandoffStop(
  registry: StreamRegistry,
  key: string,
  onStop: () => void,
): HandoffStop {
  const post = new AbortController();
  let stop: PersonStop | undefined;
  const hook = () => {
    if (stop) return stop.join();
    stop = new PersonStop();
    onStop();
    post.abort();
    return stop.join();
  };
  registry.armSendStop(key, hook);
  return {
    signal: post.signal,
    stopped: () => stop,
    disarm: () => registry.disarmSendStop(key, hook),
  };
}
