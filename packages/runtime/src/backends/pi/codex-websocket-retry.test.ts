import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AssistantMessage,
  fauxAssistantMessage,
  fauxProvider,
  isRetryableAssistantError,
} from "@earendil-works/pi-ai";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import { HoustonAuthStore } from "../../auth/credential-store";
import { PiSession } from "./session";

/**
 * Codex (ChatGPT OAuth) streams over a WebSocket. When that socket dies
 * mid-turn with no close frame — an abnormal 1006 during a long reasoning
 * stretch — pi-ai's transport rethrows it (it only falls back to SSE when the
 * failure lands BEFORE the first event) and the turn ends as an assistant
 * message with errorMessage `WebSocket closed 1006`. Nothing about that
 * response can be resumed (the Codex backend rejects `store: true`, so there
 * is no server-side response to pick back up), which is why the official
 * Codex CLI answers a mid-stream drop the same way pi does: re-issue the whole
 * request with the conversation intact, a bounded number of times, and only
 * then fail the turn.
 *
 * pi owns that retry (`websocket.?closed` is in its retryable pattern), and
 * Houston's wire translator holds the errored turn_end until `agent_settled`
 * so a healed retry never paints a card. These tests pin the whole chain on a
 * REAL pi AgentSession over the scripted faux provider: a pi bump that drops
 * the pattern, or a translator change that flushes the held error early,
 * fails here rather than as a red card in production.
 */

const WEBSOCKET_CLOSED_1006 = "WebSocket closed 1006";

function socketClosed(code = 1006): AssistantMessage {
  return fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: `WebSocket closed ${code}`,
  });
}

/**
 * A real pi AgentSession over the faux provider (scripted responses, no
 * network), built the way chat.ts builds one and wrapped in PiSession. Retry
 * backoff is zeroed so the exhausted-retries case runs in milliseconds; the
 * retry COUNT stays pi's default so the test pins the real policy.
 */
async function fauxSession(responses: AssistantMessage[]) {
  const cwd = mkdtempSync(join(tmpdir(), "houston-codex-ws-retry-"));
  const faux = fauxProvider({
    provider: "faux",
    api: "faux",
    models: [
      { id: "faux-1", name: "Faux 1", contextWindow: 200000, maxTokens: 8192 },
    ],
  });
  faux.setResponses(responses);
  const authStorage = new HoustonAuthStore(join(cwd, "auth.json"));
  authStorage.set("faux", { type: "api_key", key: "faux-key" });
  const modelRuntime = await ModelRuntime.create({
    credentials: authStorage,
    modelsPath: join(cwd, "models.json"),
  });
  modelRuntime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({
    cwd,
    agentDir: cwd,
    modelRuntime,
    model: faux.getModel() as never,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory({ retry: { baseDelayMs: 0 } }),
    tools: [],
    customTools: [],
  });
  const wrapped = new PiSession(session);
  const events: WireEvent[] = [];
  wrapped.subscribe((e) => events.push(e));
  return { faux, session: wrapped, events };
}

const providerErrors = (events: WireEvent[]) =>
  events.filter(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );

test("pi-ai's retryable predicate covers every Codex WebSocket close code seen in the wild", () => {
  // 1006 abnormal closure, 1000 server closed mid-turn, 1012 service restart.
  for (const code of [1006, 1000, 1012]) {
    expect(isRetryableAssistantError(socketClosed(code))).toBe(true);
  }
  // The connect-phase failure text and the idle watchdog's text as well.
  for (const message of [
    "WebSocket error",
    "WebSocket connect timeout after 15000ms",
    "WebSocket idle timeout after 300000ms",
  ]) {
    expect(
      isRetryableAssistantError(
        fauxAssistantMessage("", {
          stopReason: "error",
          errorMessage: message,
        }),
      ),
    ).toBe(true);
  }
});

test("a mid-turn 'WebSocket closed 1006' is retried inside the same prompt and the healed turn reaches the chat clean", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { faux, session, events } = await fauxSession([
      socketClosed(),
      fauxAssistantMessage("Recovered answer", { stopReason: "stop" }),
    ]);
    await session.prompt("hello");
    // Two provider requests: the dropped stream and its re-issue.
    expect(faux.state.callCount).toBe(2);
    // No card: the held error was dropped by the clean turn.
    expect(providerErrors(events)).toEqual([]);
    expect(
      events
        .filter(
          (e): e is Extract<WireEvent, { type: "text" }> => e.type === "text",
        )
        .map((e) => e.data)
        .join(""),
    ).toBe("Recovered answer");
    // The dropped attempt and its re-issue are both visible in runtime.log.
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^\[provider_retry\] attempt=1\/3 delay_ms=0 :: WebSocket closed 1006$/,
      ),
    );
    expect(lines).toContainEqual(
      expect.stringMatching(/^\[provider_retry\] recovered attempt=1$/),
    );
  } finally {
    warn.mockRestore();
  }
});

test("a 1006 on every attempt exhausts pi's retry budget and surfaces ONE provider_internal card", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    // pi's default budget is 3 retries: the first attempt plus three more.
    const { faux, session, events } = await fauxSession([
      socketClosed(),
      socketClosed(),
      socketClosed(),
      socketClosed(),
    ]);
    await session.prompt("hello");
    expect(faux.state.callCount).toBe(4);
    const errors = providerErrors(events);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.data).toMatchObject({
      kind: "provider_internal",
      message: WEBSOCKET_CLOSED_1006,
    });
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^\[provider_retry\] failed attempt=3 :: WebSocket closed 1006$/,
      ),
    );
  } finally {
    warn.mockRestore();
  }
});
