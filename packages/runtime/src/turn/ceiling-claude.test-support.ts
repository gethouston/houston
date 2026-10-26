import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeQuery } from "../backends/claude/session";
import { createTurnBackend, type TurnBackendDeps } from "./turn-backend";

export function ceilingClaude(
  context: TurnBackendDeps,
  input: {
    shouldStop: boolean;
    stop: () => void;
    beforeAbort?: (signal: AbortSignal | undefined) => void;
  },
) {
  const query: ClaudeQuery = async function* ({ options }) {
    writeFileSync(
      join(context.directories.workspaceDir, "result.txt"),
      "work survives",
    );
    yield {
      type: "stream_event",
      session_id: "test-session",
      parent_tool_use_id: null,
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "Saved work" },
      },
    } as unknown as SDKMessage;
    if (input.shouldStop) {
      const signal = options.abortController?.signal;
      const aborted = new Promise<void>((resolve) =>
        signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
      input.stop();
      await aborted;
      input.beforeAbort?.(context.turn.signal);
      signal?.throwIfAborted();
    }
    yield {
      type: "result",
      subtype: "success",
      session_id: "test-session",
      usage: { input_tokens: 10, output_tokens: 2 },
    } as unknown as SDKMessage;
  };
  return createTurnBackend("anthropic", {
    ...context,
    claudeSdkLoad: undefined,
    claudeSdk: {
      query,
      createSdkMcpServer: ((input: { name: string }) => ({
        type: "sdk",
        name: input.name,
        instance: {},
      })) as typeof createSdkMcpServer,
    },
  });
}
