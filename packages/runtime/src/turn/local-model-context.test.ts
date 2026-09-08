import { afterEach, expect, test, vi } from "vitest";
import { localModelContextForTurn } from "./local-model-context";
import { parseTurnRequest } from "./parse-turn-request";

const input = {
  workspaceId: "workspace",
  agentId: "agent",
  conversationId: "conversation",
  text: "prompt",
  gcsPrefix: "ws/org/agent",
  hostToken: "scoped-host",
  actingToken: "signed-acting",
  claim: {
    id: "claim",
    bootId: "boot",
    token: "claim-secret",
    heartbeatUrl: "https://gateway.test/claim",
  },
};
afterEach(() => vi.unstubAllEnvs());
test("pooled dispatch preserves signed authority and trusted callback configuration", () => {
  const turn = parseTurnRequest({
    ...input,
    localModelTransport: { baseUrl: "https://untrusted.test" },
  });
  expect(turn.actingToken).toBe("signed-acting");
  expect(localModelContextForTurn(turn, "http://gateway.internal")).toEqual({
    baseUrl: "http://gateway.internal",
    orgSlug: "org",
    agentSlug: "agent",
    hostToken: "scoped-host",
  });
});
test("production pooled callback falls back to deployment configuration", () => {
  vi.stubEnv("HOUSTON_POOL_STORE_URL", "http://configured.gateway");
  expect(localModelContextForTurn(parseTurnRequest(input))?.baseUrl).toBe(
    "http://configured.gateway",
  );
  expect(
    localModelContextForTurn(
      parseTurnRequest({ ...input, hostToken: undefined, claim: undefined }),
    ),
  ).toBeUndefined();
});
