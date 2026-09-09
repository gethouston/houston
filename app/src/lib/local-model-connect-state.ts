// Dependency-free subpath: the app's node:test entry points cannot load the
// SDK root (it pulls @houston/domain, whose extensionless imports node rejects).
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";

/** Screens in the guided local-model connection flow. */
export type LocalModelMode =
  | "detecting"
  | "empty"
  | "pick"
  | "connecting"
  | "error"
  | "unsupported"
  | "manual";

/**
 * The screen a failed connect lands on. A server that offers no bridge gets
 * its own copy: "keep the app open and retry" would send the user chasing a
 * local app that was never the problem.
 */
export function connectFailureMode(error: unknown): LocalModelMode {
  return isBridgeUnsupported(error) ? "unsupported" : "error";
}

/** Maximum time allowed for the quick local-server scan. */
export const LOCAL_MODEL_DETECT_TIMEOUT_MS = 20_000;
/** Maximum time allowed to establish and register the tunnel. */
export const LOCAL_MODEL_CONNECT_TIMEOUT_MS = 90_000;
