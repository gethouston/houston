/**
 * Test-control operations over the fake host's chat channels — the
 * `/__test__/*` routes' implementations. Kept apart from chat.ts (the real
 * contract) so the simulated-failure machinery can't blur into it.
 */
import {
  channels,
  finishTurn,
  publish,
  resetReplyDelay,
  streamReplySafe,
  TURN_DIED_MESSAGE,
  terminate,
} from "./chat";

/**
 * Simulate the host's dead-pump reaper on every running turn: a synthesized
 * terminal `error` frame carrying the dead turn's turnId and the reaper's
 * copy. The assistant reply is NEVER persisted — history ends on the user
 * message, exactly like a real dead turn. Returns how many turns were killed.
 */
export function killRunningTurns(): number {
  let killed = 0;
  for (const ch of channels.values()) {
    if (terminate(ch, TURN_DIED_MESSAGE)) killed++;
  }
  return killed;
}

/**
 * Sever every open chat stream WITHOUT touching the turns or their replay
 * logs — a simulated network drop. Returns how many streams were dropped.
 */
export function dropChatStreams(): number {
  let dropped = 0;
  for (const ch of channels.values()) {
    for (const sink of [...ch.sinks]) {
      sink.close();
      dropped++;
    }
    ch.sinks.clear();
  }
  return dropped;
}

/**
 * Drive a turn boundary while nobody watches: sever the streams, finish the
 * running turn straight into the log + history (its terminal frame is lost to
 * the client and the replay buffer clears at `done`), then start the NEXT
 * turn — as if another client sent it. The reconnecting client's cursor lands
 * outside the cleared window, so it gets frames (or a resync) for a DIFFERENT
 * turnId and must settle its own turn from history by turnId. Returns how
 * many turns were advanced.
 */
export function turnBoundary(nextText: string): number {
  let advanced = 0;
  for (const [key, ch] of channels.entries()) {
    const pending = ch.pending;
    if (!pending || !ch.channel.snapshot.running) continue;
    const [agentId = "", cid = ""] = key.split(":");
    for (const sink of [...ch.sinks]) sink.close();
    ch.sinks.clear();
    ch.epoch++; // stop the live producer loop
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

/** Drop all chat state (called on reset between tests). */
export function clearChatStreams(): void {
  for (const ch of channels.values()) {
    ch.epoch++;
    for (const sink of ch.sinks) sink.close();
  }
  channels.clear();
  resetReplyDelay();
}
