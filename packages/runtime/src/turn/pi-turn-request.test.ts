import { expect, test } from "vitest";
import { piTurnRequest } from "./pi-turn-request";
import type { TurnRequest } from "./types";

/**
 * PRODUCT-1515: the provider a pool turn runs on. The turn's PIN (the
 * conversation's picked provider, forwarded by the dispatcher — or a routine's
 * own pinned provider overlaid by executeTurn) must outrank the attached
 * credential's provider: a dispatcher that serves the wrong credential fails
 * as the PINNED provider's auth error instead of silently running the turn on
 * a provider the user never picked.
 */

const emit = () => {};
const signal = new AbortController().signal;

const base: TurnRequest = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "c1",
  text: "hi",
  gcsPrefix: "ws/w1/a1",
  credential: {
    provider: "anthropic",
    access: "AT",
    expires: 1,
    accountId: null,
    kind: "oauth",
  },
};

test("the pinned provider outranks the attached credential's", () => {
  const turn = piTurnRequest(
    { ...base, provider: "openrouter" },
    "t1",
    emit,
    signal,
  );
  expect(turn.provider).toBe("openrouter");
});

test("an unpinned legacy dispatch runs on the credential's provider", () => {
  expect(piTurnRequest(base, "t1", emit, signal).provider).toBe("anthropic");
});

test("no pin and no credential leaves the provider unattributed", () => {
  expect(
    piTurnRequest({ ...base, credential: null }, "t1", emit, signal).provider,
  ).toBe("");
});
