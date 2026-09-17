/**
 * `@houston/wire-types` — the Houston protocol v3 wire contract in TypeScript.
 *
 * Shapes and pure functions only: this package performs no I/O, opens no
 * socket and knows no gateway. The client that does all of that is the engine
 * adapter (`packages/engine-adapter`), which imports these types and
 * re-exports them so `app/src` sees one surface.
 */

export * from "./channels.ts";
export * from "./channels-refusals.ts";
export * from "./local-model-bridge.ts";
export * from "./retry-after.ts";
export * from "./types.ts";
