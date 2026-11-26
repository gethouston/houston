import type { WireEvent, WireFrame } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import { newUsedTokenCapture } from "../auth/used-token";
import { failWithRecordedResponse } from "../backends/pi/provider-response.test-support";
import type { HarnessSession } from "../backends/types";
import { newInteractionHolder } from "../session/interaction";
import { newTurnFrames } from "./turn-session-frames";
import { promptTurnSession } from "./turn-session-prompt";
import type { TurnSessionRequest } from "./turn-session-types";

/**
 * A pooled turn wraps its prompt in the provider-response capture, so a
 * failed request's status and request id reach the turn's card.
 */
test("a failed response's status and request id reach the pooled turn's card", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const listeners = new Set<(e: WireEvent) => void>();
  const session: HarnessSession = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async prompt() {
      const wire = failWithRecordedResponse();
      if (wire) for (const l of listeners) l(wire);
    },
    async abort() {},
    dispose() {},
    async setModel() {},
    async compact(): Promise<undefined> {},
    setThinkingLevel() {},
    getContextUsage() {
      return { tokens: 0 };
    },
  };
  const frames = newTurnFrames();
  const emitted: WireFrame[] = [];
  await promptTurnSession({
    session,
    backendId: "pi",
    turn: {
      conversationId: "c1",
      turnId: "t1",
      provider: "openai",
      text: "hey",
    } as TurnSessionRequest,
    prompt: "hey",
    frames,
    interaction: newInteractionHolder(),
    usedTokens: newUsedTokenCapture(),
    stallTimeoutMs: 60_000,
    firstByteDeadlineMs: 60_000,
    emit: (frame) => emitted.push(frame),
  });
  expect(frames.providerError).toMatchObject({
    kind: "unknown",
    http_status: 400,
    request_id: "oai-wrap-1",
  });
  vi.restoreAllMocks();
});
