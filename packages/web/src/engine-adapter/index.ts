/**
 * Drop-in replacement for `@houston-ai/engine-client`, backed by the Houston
 * host (packages/host). Aliased in vite.config.ts when host/new-engine mode is
 * active, so the entire desktop UI (app/src) runs on the new engine unchanged.
 *
 * Types are reused verbatim from the original package; only the HoustonClient
 * and EngineWebSocket implementations change.
 */

// The public store catalog reads (anonymous, CORS-open) are deployment-shape
// agnostic, so the adapter serves the ui package's implementation as-is.
export * from "../../../../ui/engine-client/src/store-catalog";
export * from "../../../../ui/engine-client/src/types";
export type { HoustonClientOptions } from "./client";
export {
  HoustonClient,
  HoustonEngineError,
  isHoustonEngineError,
} from "./client";
// Local conversation cache (HOU-712): sign-out wipes the per-user cached
// transcripts so nothing lingers on a shared machine. The scope helper also
// keys the app's list-query persistence to the same gateway+user identity.
export { clearConversationCache } from "./conversation-cache";
export { conversationCacheScope } from "./conversation-cache-identity";
// Warming-engine send queue (HOU-693): show the message as sent while the
// engine boots; the deferred real send suppresses its own bubble.
export { pushPendingUserMessage } from "./turn-stream";
// The conversation-VM read side: the app binds this store with
// `useSdkSnapshot(conversationStore, conversationScope(agentPath, sessionKey))`.
export { conversationStore } from "./vm";
export { EngineWebSocket, topics } from "./ws";
