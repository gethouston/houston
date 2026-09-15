/**
 * @houston-ai/engine-client — the shared client surface for the Houston engine.
 *
 * The specifier `@houston-ai/engine-client` resolves to the v3 host adapter
 * (`packages/web/src/engine-adapter`) in every build AND every typecheck, so
 * what this package publishes is the deployment-agnostic half the adapter
 * re-exports: the wire types, the anonymous store-catalog reads, the
 * local-model-bridge port, and the `Retry-After` parser.
 */

export * from "./local-model-bridge.ts";
export * from "./retry-after.ts";
export * from "./store-catalog.ts";
export * from "./types.ts";
