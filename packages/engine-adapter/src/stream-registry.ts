/**
 * Compat re-export: the conversation stream registry moved into `@houston/sdk`
 * with the turn machinery, and the adapter now owns a single {@link
 * StreamRegistry} instance in `turn-stream.ts`. `disposeAllStreams` is
 * re-exported from its historical path so the WS teardown seam (`ws.ts`) and its
 * unit test resolve unchanged — it aborts THIS adapter's streams only.
 */
export { disposeAllStreams } from "./turn-stream";
