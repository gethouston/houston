/**
 * Turn-identity classification for the turn sink — pure, no state.
 *
 * The wire stamps every turn-scoped frame with the turn's `turnId` and every
 * running `sync` with the RUNNING turn's id (`data.turnId`); legacy servers
 * stamp nothing. The sink adopts ITS turn's id once (turn mode: from the
 * nonce-matched `user` echo; observer mode: from the attaching running sync)
 * and then classifies everything else against it:
 *
 * | frame turnId | sink turnId | verdict    | meaning                          |
 * |--------------|-------------|------------|----------------------------------|
 * | absent       | any         | `ours`     | legacy server: today's best-effort continuation |
 * | present      | absent      | `foreign`  | a stamped frame before we know our turn (pre-echo replay tail, another writer) — drop it |
 * | present      | same        | `ours`     | our turn's frame                 |
 * | present      | different   | `boundary` | OUR turn is over; a new turn owns the stream |
 *
 * A running sync classifies the same way except that a stamped sync with no
 * adopted id is `adopt` instead of `foreign`: the observer's attach point, and
 * — turn mode, only once the send was accepted — the resync recovery path (the
 * one-turn-per-conversation gate makes the running turn ours in all but a
 * pathological our-turn-died-and-another-started race, and refusing to adopt
 * would strand the turn spinning forever).
 */

export type FrameVerdict = "ours" | "foreign" | "boundary";

/** Classify a turn-scoped frame's envelope `turnId` against the sink's. */
export function classifyFrame(
  mine: string | undefined,
  frameTurnId: string | undefined,
): FrameVerdict {
  if (!frameTurnId) return "ours"; // legacy server — best-effort continuation
  if (!mine) return "foreign";
  return frameTurnId === mine ? "ours" : "boundary";
}

export type RunningSyncVerdict = FrameVerdict | "adopt";

/**
 * Classify a RUNNING sync's `data.turnId`. `mayAdopt` gates the unknown-id
 * case: true for an observer's attach and for a turn sink whose send was
 * accepted; false for a turn sink that hasn't sent yet (a running turn seen
 * pre-send belongs to another writer — never splice its partial into ours).
 */
export function classifyRunningSync(
  mine: string | undefined,
  syncTurnId: string | undefined,
  mayAdopt: boolean,
): RunningSyncVerdict {
  if (!syncTurnId) return "ours"; // legacy server — today's behavior
  if (!mine) return mayAdopt ? "adopt" : "foreign";
  return syncTurnId === mine ? "ours" : "boundary";
}
