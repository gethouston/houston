/**
 * Drop-in replacement for `@houston-ai/engine-client`, backed by the Houston
 * host (packages/host). Aliased in vite.config.ts when host/new-engine mode is
 * active, so the entire desktop UI (app/src) runs on the new engine unchanged.
 *
 * Types are reused verbatim from the original package; only the HoustonClient
 * and EngineWebSocket implementations change.
 */
export * from "../../../../ui/engine-client/src/types";
export type { HoustonClientOptions } from "./client";
export {
  HoustonClient,
  HoustonEngineError,
  isHoustonEngineError,
} from "./client";
export { EngineWebSocket, topics } from "./ws";
