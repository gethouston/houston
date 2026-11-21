import {
  channels,
  finishTurn,
  publish,
  releaseHeldTurn,
  resetReplyDelay,
  streamReplySafe,
  TURN_DIED_MESSAGE,
  terminate,
} from "./chat";

export function killRunningTurns(): number {
  let killed = 0;
  for (const ch of channels.values()) {
    if (terminate(ch, TURN_DIED_MESSAGE)) killed++;
  }
  releaseHeldTurn();
  return killed;
}

export function dropChatStreams(): number {
  let dropped = 0;
  for (const ch of channels.values()) {
    for (const sink of [...ch.sinks]) {
      sink.close();
      dropped++;
    }
    ch.sinks.clear();
  }
  releaseHeldTurn();
  return dropped;
}

export function turnBoundary(nextText: string): number {
  let advanced = 0;
  for (const [key, ch] of channels.entries()) {
    const pending = ch.pending;
    if (!pending || !ch.channel.snapshot.running) continue;
    const [agentId = "", cid = ""] = key.split(":");
    for (const sink of [...ch.sinks]) sink.close();
    ch.sinks.clear();
    ch.epoch++;
    releaseHeldTurn();
    const partial = ch.channel.snapshot.partial;
    const rest = pending.remaining.splice(0);
    for (const d of rest) {
      publish(ch, { type: "text", data: d, turnId: pending.turnId });
    }
    finishTurn(agentId, cid, ch, pending.turnId, partial + rest.join(""));
    streamReplySafe(agentId, cid, nextText, undefined);
    advanced++;
  }
  return advanced;
}

export function clearChatStreams(): void {
  for (const ch of channels.values()) {
    ch.epoch++;
    for (const sink of ch.sinks) sink.close();
  }
  channels.clear();
  resetReplyDelay();
}
