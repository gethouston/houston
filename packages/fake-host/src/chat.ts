/**
 * The fake host's chat-stream engine — resumable, sequenced, and turn-stamped,
 * built from the SAME shared pieces as the real servers (runtime
 * `transport/events-route.ts`, host `turn/events-route.ts`):
 *
 * - `StreamChannel` owns each conversation's publish ordering (append →
 *   reduce → fan out → clear-on-terminal); every turn-scoped frame carries the
 *   turn's `turnId`, and the `user` echo carries the sender's nonce — exactly
 *   the identity contract the client's turn sink matches against.
 * - `serveResumableStream` serves each connection: fresh connect → `sync`;
 *   `?after=<seq>` / `Last-Event-ID` → gap/dupe-free replay; unserviceable
 *   cursor → `sync` with `resync: true`.
 * - Turns run regardless of subscribers, and history persists the user message
 *   at turn start + the assistant reply at turn end (both with `turnId`), like
 *   the real runtime.
 *
 * Test controls: `dropChatStreams` severs open streams WITHOUT ending the
 * turns (network drop); `killRunningTurns` synthesizes the dead-pump reaper's
 * terminal error; `turnBoundary` ends the running turn while nobody watches
 * and starts the NEXT one (the resync-across-a-turn-boundary e2e).
 *
 * This module is the aggregate front door; the pieces live in `chat-channel.ts`
 * (channel registry + publish), `chat-turn.ts` (turn/reply production +
 * terminate/cancel), and `chat-stream.ts` (the SSE + message HTTP surface).
 */

export * from "./chat-channel";
export * from "./chat-stream";
export * from "./chat-turn";
