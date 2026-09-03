// Re-export: the classifier lives in the engine adapter (see
// ./engine-waking-error.ts for why). Keeps the app's import path and the
// node:test entry point stable.
export { isNetworkTransportError } from "../../../packages/web/src/engine-adapter/network-transport-error.ts";
