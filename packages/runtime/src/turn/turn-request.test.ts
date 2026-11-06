import { expect, test } from "vitest";
import { parseTurnRequest } from "./parse-turn-request";
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

/**
 * The gateway always sends both context fields, empty when the org has none
 * (what the standing pod's send path gets). An empty string is still provided
 * context: it must never fall back to the file mode, whose section names
 * absolute paths under the turn root.
 */
test("empty gateway context is provided context, never the file fallback", () => {
  const turn = turnSessionRequest(
    parseTurnRequest({ ...base, workspaceContext: "", userContext: "" }),
    "t1",
    emit,
    signal,
  );
  expect(turn.context).toEqual({ workspace: "", user: "" });
});

test("a turn with neither context field keeps the file fallback", () => {
  expect(turnSessionRequest(base, "t1", emit, signal).context).toBeUndefined();
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

test("only a routine fire is marked one; a person's send in its chat is not", () => {
  const fire = turnSessionRequest(
    { ...base, conversationId: "routine-r1", routine: { id: "r1" } },
    "t1",
    emit,
    signal,
  );
  const chat = turnSessionRequest(
    { ...base, conversationId: "routine-r1" },
    "t1",
    emit,
    signal,
  );
  expect(fire.routineFire).toBe(true);
  expect(chat.routineFire).toBeUndefined();
});

test("the session carries when the turn's host token expires, read from its exp", () => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const claims = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const turn = turnSessionRequest(
    { ...base, hostToken: `turn-v1.${claims}.sig` },
    "t1",
    emit,
    signal,
  );
  expect(turn.tokenExpiresAt).toBe(exp * 1000);
});

test("a turn preserves the planner's IANA timezone", () => {
  const parsed = parseTurnRequest({ ...base, timezone: "America/New_York" });
  expect(parsed.timezone).toBe("America/New_York");
  expect(turnSessionRequest(parsed, "t1", emit, signal).timezone).toBe(
    "America/New_York",
  );
  expect(parseTurnRequest(base).timezone).toBeUndefined();
  for (const timezone of ["", "Mars/Olympus", 42, null]) {
    expect(() => parseTurnRequest({ ...base, timezone })).toThrow(/timezone/);
  }
});
