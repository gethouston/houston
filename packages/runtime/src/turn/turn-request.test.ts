import { expect, test } from "vitest";
import { turnSessionRequest } from "./turn-request";
import type { TurnRequest } from "./types";

/**
 * The provider a pool turn runs on comes from its pin. The turn's PIN (the
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
  const turn = turnSessionRequest(
    { ...base, provider: "openrouter" },
    "t1",
    emit,
    signal,
  );
  expect(turn.provider).toBe("openrouter");
});

test("an unpinned legacy dispatch runs on the credential's provider", () => {
  expect(turnSessionRequest(base, "t1", emit, signal).provider).toBe(
    "anthropic",
  );
});

test("no pin and no credential leaves the provider unattributed", () => {
  expect(
    turnSessionRequest({ ...base, credential: null }, "t1", emit, signal)
      .provider,
  ).toBe("");
});

test("only grant scopes and the sandbox closure reach the pi request", () => {
  const call = async () => Response.json({});
  const turn = turnSessionRequest(
    {
      ...base,
      claim: {
        id: "claim",
        bootId: "boot",
        token: "claim-secret",
        heartbeatUrl: "https://gateway.test/heartbeat",
      },
      hostToken: "host-secret",
      grant: {
        url: "https://gateway.test",
        token: "grant-secret",
        expires: 2_000_000_000,
        scopes: ["integrations"],
      },
    },
    "t1",
    emit,
    signal,
    { call },
  );
  expect(turn.grant).toEqual({ scopes: ["integrations"] });
  expect(turn.sandbox?.call).toBe(call);
  expect(JSON.stringify(turn)).not.toContain("grant-secret");
  expect(JSON.stringify(turn)).not.toContain("host-secret");
});
