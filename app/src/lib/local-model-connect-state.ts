/** Screens in the guided local-model connection flow. */
export type LocalModelMode =
  | "detecting"
  | "empty"
  | "pick"
  | "connecting"
  | "error"
  | "manual";

/** Maximum time allowed for the quick local-server scan. */
export const LOCAL_MODEL_DETECT_TIMEOUT_MS = 20_000;
/** Maximum time allowed to establish and register the tunnel. */
export const LOCAL_MODEL_CONNECT_TIMEOUT_MS = 90_000;
