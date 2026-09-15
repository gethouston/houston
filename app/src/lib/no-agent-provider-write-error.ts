// The classifier lives in the engine adapter (the adapter is bundled by the
// desktop app, which cannot resolve `@houston/app/*`, so app code must never be
// imported from there). This module keeps the app's import path stable.
export { isNoAgentForProviderWriteError } from "@houston/engine-adapter/no-agent-provider-write-error";
