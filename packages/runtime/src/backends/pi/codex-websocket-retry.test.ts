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
import { SentRequests } from "./model-phase";
import { PiSession } from "./session";

const WEBSOCKET_CLOSED_1006 = "WebSocket closed 1006";

function socketClosed(code = 1006): AssistantMessage {
  return fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: `WebSocket closed ${code}`,
  });
}

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
  const wrapped = new PiSession(session, new SentRequests());
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
  for (const code of [1006, 1000, 1012]) {
    expect(isRetryableAssistantError(socketClosed(code))).toBe(true);
  }
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
    expect(faux.state.callCount).toBe(2);
    expect(providerErrors(events)).toEqual([]);
    expect(
      events
        .filter(
          (e): e is Extract<WireEvent, { type: "text" }> => e.type === "text",
        )
        .map((e) => e.data)
        .join(""),
    ).toBe("Recovered answer");
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
