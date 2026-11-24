import { expect, test } from "vitest";
import { parseTurnRequest } from "./parse-turn-request";

const CALLBACK = "https://gateway.test/v1/integrations/custom/oauth/callback";

const granted = {
  workspaceId: "org",
  agentId: "agent",
  conversationId: "c1",
  text: "hi",
  gcsPrefix: "ws/org/agent",
  hostToken: "host-secret",
  claim: {
    id: "claim-1",
    bootId: "boot-1",
    token: "claim-secret",
    heartbeatUrl: "https://gateway.test/v1/pool/claims/heartbeat",
  },
  grant: {
    url: "https://gateway.test",
    token: "grant-secret",
    expires: 2_000_000_000,
    scopes: ["integrations"],
  },
};

test("a granted turn carries the gateway's custom sign-in callback", () => {
  expect(
    parseTurnRequest({ ...granted, customOAuthCallbackUrl: CALLBACK })
      .customOAuthCallbackUrl,
  ).toBe(CALLBACK);
});

test("a turn from a gateway that holds no sign-in attempts has no callback", () => {
  expect(parseTurnRequest(granted).customOAuthCallbackUrl).toBeUndefined();
});

test("a turn without a grant ignores the callback", () => {
  const { grant: _grant, ...ungranted } = granted;
  expect(
    parseTurnRequest({ ...ungranted, customOAuthCallbackUrl: CALLBACK })
      .customOAuthCallbackUrl,
  ).toBeUndefined();
});

test.each([
  "http://gateway.test/v1/integrations/custom/oauth/callback",
  "https://gateway.test/elsewhere",
  "https://gateway.test/v1/integrations/custom/oauth/callback?x=1",
  "not a url",
  42,
])("a malformed callback %s refuses the turn", (customOAuthCallbackUrl) => {
  expect(() =>
    parseTurnRequest({ ...granted, customOAuthCallbackUrl }),
  ).toThrow(/customOAuthCallbackUrl/);
});
