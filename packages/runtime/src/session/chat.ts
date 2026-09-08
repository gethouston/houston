/**
 * The runtime's public turn API: start (queued per conversation), cancel,
 * dispose. Fire-and-forget from the caller's view — events are delivered over
 * the conversation's event bus (`GET /conversations/:id/events`), NOT on the
 * request that triggered the turn. The session cache lives in
 * conversation-cache.ts; the turn executor in exec-turn.ts; the compaction
 * decision in provider-switch.ts.
 *
 * The implementation is split behind this face: accepting a turn lives in
 * turn-start.ts, the cards a turn refused before it ran in
 * turn-start-failure.ts, and the out-of-turn controls (mode flip, cancel,
 * dispose) in conversation-control.ts.
 */

export {
  cancelTurn,
  disposeConversation,
  STOPPED_BY_USER,
  setLiveTurnMode,
} from "./conversation-control";
export { ensureProviderForTurn, runTurn } from "./turn-start";
