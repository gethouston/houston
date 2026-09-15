/**
 * `@houston-ai/engine-client` IS this module: `app/vite.config.ts` and
 * `packages/web/vite.config.ts` alias the specifier here, and both tsconfigs
 * carry the matching `paths` entry, so the whole UI (app/src) compiles against
 * exactly what it runs.
 *
 * The shared wire types and the deployment-agnostic reads still come from the
 * `ui/engine-client` package; the client implementation lives here.
 */

// The local-model-bridge port (types only) and the public store catalog reads
// (anonymous, CORS-open) are deployment-shape agnostic, so the adapter serves
// the ui package's implementations as-is.
export * from "../../../../ui/engine-client/src/local-model-bridge";
export * from "../../../../ui/engine-client/src/store-catalog";
export * from "../../../../ui/engine-client/src/types";
export type { HoustonClientOptions } from "./client";
export {
  HoustonClient,
  HoustonEngineError,
  isHoustonEngineError,
  isSignedOutEngineError,
  SIGNED_OUT_ERROR,
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
export { EngineWebSocket } from "./ws";
