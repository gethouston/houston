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

const MALFORMED_RESPONSE = "Provider stopped with: MALFORMED_RESPONSE";

function malformed(reason = "MALFORMED_RESPONSE"): AssistantMessage {
  return fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: `Provider stopped with: ${reason}`,
  });
}

async function fauxSession(responses: AssistantMessage[]) {
  const cwd = mkdtempSync(join(tmpdir(), "houston-malformed-retry-"));
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

test("pi-ai's retryable predicate covers Gemini's MALFORMED stops but not its policy stops", () => {
  for (const reason of ["MALFORMED_RESPONSE", "MALFORMED_FUNCTION_CALL"]) {
    expect(isRetryableAssistantError(malformed(reason))).toBe(true);
  }
  expect(
    isRetryableAssistantError(
      fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "Unhandled stop reason: MALFORMED_RESPONSE",
      }),
    ),
  ).toBe(true);
  for (const reason of ["SAFETY", "RECITATION", "BLOCKLIST"]) {
    expect(isRetryableAssistantError(malformed(reason))).toBe(false);
  }
});

test("a MALFORMED_RESPONSE stop is retried inside the same prompt and the healed turn reaches the chat clean", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { faux, session, events } = await fauxSession([
      malformed(),
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
  } finally {
    warn.mockRestore();
  }
});

test("MALFORMED_RESPONSE on every attempt exhausts pi's retry budget and surfaces ONE provider_internal card", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { faux, session, events } = await fauxSession([
      malformed(),
      malformed(),
      malformed(),
      malformed(),
    ]);
    await session.prompt("hello");
    expect(faux.state.callCount).toBe(4);
    const errors = providerErrors(events);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.data).toMatchObject({
      kind: "provider_internal",
      message: MALFORMED_RESPONSE,
    });
  } finally {
    warn.mockRestore();
  }
});

test("a SAFETY stop is not retried: one request, the refusal surfaces as-is", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { faux, session, events } = await fauxSession([
      malformed("SAFETY"),
      fauxAssistantMessage("never reached", { stopReason: "stop" }),
    ]);
    await session.prompt("hello");
    expect(faux.state.callCount).toBe(1);
    const errors = providerErrors(events);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.data.kind).toBe("unknown");
  } finally {
    error.mockRestore();
  }
});
