// The classifier itself lives in the engine adapter (see the note at the top
// of that file: the adapter is bundled by the desktop app, which cannot resolve
// `@houston/app/*`, so app code must never be imported from there). This
// module keeps the app's import path and the node:test entry point stable.
export { isEngineWakingError } from "../../../packages/web/src/engine-adapter/engine-waking-error.ts";
