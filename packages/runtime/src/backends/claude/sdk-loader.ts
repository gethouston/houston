import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeQuery } from "./session";

/** Thrown when the optional Claude Agent SDK is not present in this build. */
export class ClaudeBackendUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Claude backend unavailable in this build");
    this.name = "ClaudeBackendUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

/** Optional Claude SDK slice used by the backend and its tests. */
export interface ClaudeSdk {
  query: ClaudeQuery;
  createSdkMcpServer: typeof createSdkMcpServer;
}

export type ClaudeSdkLoadResult =
  | { ok: true; sdk: ClaudeSdk }
  | { ok: false; error: unknown };

/** Start the optional SDK import without leaving an early rejection unhandled. */
export function preloadClaudeSdk(
  sdk?: ClaudeSdk,
): Promise<ClaudeSdkLoadResult> {
  if (sdk) return Promise.resolve({ ok: true, sdk });
  return import("@anthropic-ai/claude-agent-sdk").then(
    (loaded) => ({
      ok: true,
      sdk: {
        query: loaded.query as ClaudeQuery,
        createSdkMcpServer: loaded.createSdkMcpServer,
      },
    }),
    (error: unknown) => ({ ok: false, error }),
  );
}

/** Recover the loaded SDK or raise its original import failure. */
export async function loadedClaudeSdk(
  load: Promise<ClaudeSdkLoadResult>,
): Promise<ClaudeSdk> {
  const result = await load;
  if (!result.ok) throw result.error;
  return result.sdk;
}
