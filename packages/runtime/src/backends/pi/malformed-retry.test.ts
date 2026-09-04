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
 * Gemini ends a turn with finishReason MALFORMED_RESPONSE / MALFORMED_FUNCTION_CALL
 * when the MODEL's own generation broke (a garbled response, an unparseable tool
 * call). pi-ai flattens both to `Provider stopped with: <REASON>`, no status, no
 * body. Google's guidance is to retry the same request, and pi already owns a
 * retry loop for transient provider failures — but its retryable pattern did
 * not know these tokens, so every such turn died on the first attempt and the
 * user got the Retry card for a failure that a retry would have healed.
 *
 * The pi-ai pnpm patch (patches/@earendil-works__pi-ai) adds the two tokens
 * to that pattern. These tests are the patch guard: they drive a REAL pi
 * AgentSession over the scripted faux provider through Houston's PiSession
 * seam, so a pi bump that drops the hunk fails here, not in production.
 */

const MALFORMED_RESPONSE = "Provider stopped with: MALFORMED_RESPONSE";

function malformed(reason = "MALFORMED_RESPONSE"): AssistantMessage {
  return fauxAssistantMessage("", {
    stopReason: "error",
    errorMessage: `Provider stopped with: ${reason}`,
  });
}

/**
 * A real pi AgentSession over the faux provider (scripted responses, no
 * network), built the way chat.ts builds one and wrapped in PiSession. Retry
 * backoff is zeroed so the exhausted-retries case runs in milliseconds; the
 * retry COUNT stays pi's default so the test pins the real policy.
 */
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
  // Seed the credential through the store, never setRuntimeApiKey (its awaited
  // refresh() hangs in pi 0.82+).
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

test("pi-ai's retryable predicate covers Gemini's MALFORMED stops but not its policy stops", () => {
  for (const reason of ["MALFORMED_RESPONSE", "MALFORMED_FUNCTION_CALL"]) {
    expect(isRetryableAssistantError(malformed(reason))).toBe(true);
  }
  // Older pi phrasing of the same finish reason.
  expect(
    isRetryableAssistantError(
      fauxAssistantMessage("", {
        stopReason: "error",
        errorMessage: "Unhandled stop reason: MALFORMED_RESPONSE",
      }),
    ),
  ).toBe(true);
  // Refusals share the prefix; a retry cannot fix them and must not be spent.
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
    // Two provider requests: the broken generation and its retry.
    expect(faux.state.callCount).toBe(2);
    // The held error was dropped by the clean turn: no card, just the answer.
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
    // pi's default budget is 3 retries: the first attempt plus three more.
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
