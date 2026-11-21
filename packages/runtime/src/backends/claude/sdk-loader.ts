import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeQuery } from "./session";

export class ClaudeBackendUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Claude backend unavailable in this build");
    this.name = "ClaudeBackendUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

export interface ClaudeSdk {
  query: ClaudeQuery;
  createSdkMcpServer: typeof createSdkMcpServer;
}

export type ClaudeSdkLoadResult =
  | { ok: true; sdk: ClaudeSdk }
  | { ok: false; error: unknown };

let processSdkLoad: Promise<ClaudeSdkLoadResult> | undefined;

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

export async function loadedClaudeSdk(
  load: Promise<ClaudeSdkLoadResult>,
): Promise<ClaudeSdk> {
  const result = await load;
  if (!result.ok) throw result.error;
  return result.sdk;
}
