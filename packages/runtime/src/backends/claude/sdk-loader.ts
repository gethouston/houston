import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeQuery } from "./session";
import type { ClaudeStartup } from "./session-deps";

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
  /** Spawn a CLI ahead of its prompt (`./session-warm.ts`); absent = never. */
  startup?: ClaudeStartup;
}

export type ClaudeSdkLoadResult =
  | { ok: true; sdk: ClaudeSdk }
  | { ok: false; error: unknown };

let processSdkLoad: Promise<ClaudeSdkLoadResult> | undefined;

/** Share one optional SDK import per process, retrying after a failed preload. */
export function preloadClaudeSdk(
  sdk?: ClaudeSdk,
): Promise<ClaudeSdkLoadResult> {
  if (sdk) return Promise.resolve({ ok: true, sdk });
  if (processSdkLoad) return processSdkLoad;
  const load = import("@anthropic-ai/claude-agent-sdk").then(
    (loaded) => ({
      ok: true as const,
      sdk: {
        query: loaded.query as ClaudeQuery,
        createSdkMcpServer: loaded.createSdkMcpServer,
        startup: loaded.startup,
      },
    }),
    (error: unknown) => {
      if (processSdkLoad === load) processSdkLoad = undefined;
      return { ok: false as const, error };
    },
  );
  processSdkLoad = load;
  return load;
}

/** Recover the loaded SDK or raise its original import failure. */
export async function loadedClaudeSdk(
  load: Promise<ClaudeSdkLoadResult>,
): Promise<ClaudeSdk> {
  const result = await load;
  if (!result.ok) throw result.error;
  return result.sdk;
}
