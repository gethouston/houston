/**
 * Drop-in replacement for `@houston-ai/engine-client`, backed by the new TS
 * engine (packages/engine). Aliased in vite.config.ts when VITE_NEW_ENGINE_URL
 * is set, so the entire desktop UI (app/src) runs on the new engine unchanged.
 *
 * Types are reused verbatim from the original package; only the HoustonClient
 * and EngineWebSocket implementations change.
 */
export * from "../../../../ui/engine-client/src/types";
export { HoustonClient, HoustonEngineError, isHoustonEngineError } from "./client";
export type { HoustonClientOptions } from "./client";
export { EngineWebSocket, topics } from "./ws";
