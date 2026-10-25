import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WireFrame } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, vi } from "vitest";
import { ceilingClaude } from "./ceiling-claude.test-support";
import {
  ceilingPi,
  piEvent,
  piFailure,
  piText,
} from "./ceiling-pi.test-support";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";

export async function realCeiling(
  input: {
    retry?: boolean;
    claude?: boolean;
    stopDuring?: "prompt" | "sync" | "publish" | "follow_up";
    intercept?: (
      url: string,
      init?: RequestInit,
    ) => Promise<Response | undefined>;
    writeWorkspace?: (workspaceDir: string) => void;
    beforeAbort?: (signal: AbortSignal | undefined) => void;
  } = {},
) {
  const pool = fakePoolStore("ws/org/agent");
  pool.put("workspaces/W/A/CLAUDE.md", "You help.");
  let stopping = false;
  let stopped = false;
  let signal: AbortSignal | undefined;
  let finish = () => {};
  let followUpCalls = 0;
  const server = createTurnServer({
    token: "",
    store: new LocalDirStore(pool.root),
    poolStoreUrl: POOL_STORE_URL,
    heartbeatIntervalMs: 5,
    transcriptRetryDelaysMs: [],
    activityDocRetryDelaysMs: [],
    fetchImpl: async (url, init) => {
      if (String(url) === HEARTBEAT_URL) {
        if (stopping) stopped = true;
        return stopping
          ? Response.json({ stop: "turn_time_limit" })
          : new Response(null, { status: 204 });
      }
      if (
        init?.method === "PUT" &&
        ((input.stopDuring === "sync" && String(url).includes("/objects/")) ||
          (input.stopDuring === "publish" &&
            String(url).includes("/transcripts/")))
      ) {
        stopping = true;
        await vi.waitFor(() => expect(stopped).toBe(true));
      }
      const intercepted = await input.intercept?.(String(url), init);
      return intercepted ?? pool.fetchImpl(url, init);
    },
    turnSessionDeps: {
      createBackend: (_provider, context) => {
        if (input.claude)
          return ceilingClaude(context, {
            shouldStop: (input.stopDuring ?? "prompt") === "prompt",
            stop: () => {
              stopping = true;
            },
            beforeAbort: input.beforeAbort,
          });
        signal = context.turn.signal;
        const session = ceilingPi({
          prompt: async (emit) => {
            emit(piEvent({ type: "agent_start" }));
            emit(piText);
            input.writeWorkspace?.(context.directories.workspaceDir);
            writeFileSync(
              join(context.directories.workspaceDir, "result.txt"),
              "work survives",
            );
            if ((input.stopDuring ?? "prompt") === "prompt") {
              if (input.retry) {
                emit(piFailure("503 Service Unavailable"));
                emit(
                  piEvent({
                    type: "auto_retry_start",
                    errorMessage: "503 Service Unavailable",
                    delayMs: 60000,
                    attempt: 1,
                    maxAttempts: 3,
                  }),
                );
              }
              const pending = new Promise<void>((resolve) => {
                finish = resolve;
              });
              stopping = true;
              await pending;
            }
            emit(piEvent({ type: "agent_settled" }));
          },
          abort: (emit) => {
            input.beforeAbort?.(signal);
            if (!input.retry) emit(piFailure("This operation was aborted"));
            finish();
          },
        });
        session.forceToolCall = async () => {
          followUpCalls += 1;
          stopping = true;
          await vi.waitFor(() => expect(stopped).toBe(true));
          return { outcome: "unsupported", reason: "test" };
        };
        return { id: "pi", createSession: async () => session };
      },
    },
    removeTurnRoot: async (root) => {
      rmSync(root, { recursive: true, force: true });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/turn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: randomUUID(),
        agentId: "agent",
        conversationId: "c",
        turnId: "t",
        text: "work",
        mode: input.stopDuring === "follow_up" ? "execute" : "plan",
        gcsPrefix: "ws/org/agent",
        hostToken: "host",
        credential: {
          provider: input.claude ? "anthropic" : "openai-codex",
          access: input.claude ? "sk-ant-oat01-test" : "test",
          expires: Date.now() + 60000,
        },
        claim: {
          id: "claim",
          token: "token",
          bootId: "boot",
          heartbeatUrl: HEARTBEAT_URL,
        },
      }),
    });
    const raw = await response.text();
    const frames: WireFrame[] = raw
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    return { frames, pool, followUpCalls };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
