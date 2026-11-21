import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";

export type LocalModelMode =
  | "detecting"
  | "empty"
  | "pick"
  | "connecting"
  | "error"
  | "unsupported"
  | "manual";

export function connectFailureMode(error: unknown): LocalModelMode {
  return isBridgeUnsupported(error) ? "unsupported" : "error";
}

export const LOCAL_MODEL_DETECT_TIMEOUT_MS = 20_000;
export const LOCAL_MODEL_CONNECT_TIMEOUT_MS = 90_000;
