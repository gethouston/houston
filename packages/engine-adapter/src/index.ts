/**
 * `@houston/engine-adapter` IS this module: `app` and `packages/web` both
 * declare the workspace dependency, so the specifier resolves through pnpm's
 * symlink at `node_modules/@houston/engine-adapter`. No alias, no tsconfig
 * `paths` entry — the whole UI (app/src) compiles against exactly what it
 * runs.
 *
 * The shapes it speaks in are `@houston/wire-types`, which has no I/O of its
 * own; the adapter re-exports them so `app/src` reads one surface.
 */

export * from "@houston/wire-types";
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
// The app installs its reporting path here for failures the adapter absorbs.
export { type AdapterErrorSink, setAdapterErrorSink } from "./error-sink";
// Warming-engine send queue (HOU-693): show the message as sent while the
// engine boots; the deferred real send suppresses its own bubble.
export { pushPendingUserMessage } from "./turn-stream";
// The conversation-VM read side: the app binds this store with
// `useSdkSnapshot(conversationStore, conversationScope(agentPath, sessionKey))`.
export { conversationStore } from "./vm";
export { EngineWebSocket } from "./ws";
