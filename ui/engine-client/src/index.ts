/**
 * @houston-ai/engine-client — TypeScript SDK for the Houston Engine.
 *
 * Consumed by:
 * - Houston desktop app (`app/src/`) via `window.__HOUSTON_ENGINE__`
 * - Houston mobile app (direct connect, out of scope until Phase 5)
 * - Third-party integrators (npm package)
 *
 * Single source of truth for the wire protocol, matching
 * `engine/houston-engine-protocol`.
 */

export * from "./client.ts";
export * from "./store-catalog.ts";
export * from "./types.ts";
export * from "./vm.ts";
export * from "./ws.ts";
