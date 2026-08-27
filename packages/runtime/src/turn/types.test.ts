import { expect, test } from "vitest";
import { parseTurnRequest } from "./parse-turn-request";

const BASE = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "c1",
  text: "hello",
  gcsPrefix: "ws/w1/a1",
};

test("parseTurnRequest defaults mode to execute when absent", () => {
  expect(parseTurnRequest(BASE).mode).toBe("execute");
});

test("parseTurnRequest accepts an explicit plan mode", () => {
  expect(parseTurnRequest({ ...BASE, mode: "plan" }).mode).toBe("plan");
});

test("parseTurnRequest accepts an explicit auto mode", () => {
  expect(parseTurnRequest({ ...BASE, mode: "auto" }).mode).toBe("auto");
});

test("parseTurnRequest never trusts the wire — an unknown mode is execute", () => {
  expect(parseTurnRequest({ ...BASE, mode: "execute" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "PLAN" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "AUTO" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: "" }).mode).toBe("execute");
  expect(parseTurnRequest({ ...BASE, mode: 1 }).mode).toBe("execute");
});

test("parseTurnRequest accepts the pool execution envelope", () => {
  expect(
    parseTurnRequest({
      ...BASE,
      turnId: "turn-1",
      hostToken: "host-secret",
      actingAs: { userId: "user-1", name: "Ada" },
      shadow: true,
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-secret",
        heartbeatUrl: "https://gateway.test/claims/claim-1/heartbeat",
      },
    }),
  ).toMatchObject({
    turnId: "turn-1",
    hostToken: "host-secret",
    actingAs: { userId: "user-1", name: "Ada" },
    shadow: true,
    claim: { id: "claim-1", bootId: "boot-1", token: "claim-secret" },
  });
});

test.each([
  ["turnId", { turnId: "bad/id" }],
  ["hostToken", { hostToken: "" }],
  ["actingAs", { actingAs: { userId: "" } }],
  ["actingAs", { actingAs: { userId: "u1", extra: true } }],
  ["shadow", { shadow: "true" }],
  ["claim", { claim: { id: "c", bootId: "b", token: "t" } }],
  [
    "claim",
    {
      claim: {
        id: "c",
        bootId: "b",
        token: "t",
        heartbeatUrl: "https://gateway.test/hb",
        extra: true,
      },
    },
  ],
])("rejects an invalid optional %s field", (_field, extra) => {
  expect(() => parseTurnRequest({ ...BASE, ...extra })).toThrow();
});

test("claim and hostToken are all-or-nothing", () => {
  const claim = {
    id: "claim-1",
    bootId: "boot-1",
    token: "claim-secret",
    heartbeatUrl: "https://gateway.test/heartbeat",
  };
  expect(() => parseTurnRequest({ ...BASE, claim })).toThrow(
    "claim and hostToken",
  );
  expect(() => parseTurnRequest({ ...BASE, hostToken: "host-secret" })).toThrow(
    "claim and hostToken",
  );
});

test("a claimed turn requires exactly ws/org/agent", () => {
  expect(() =>
    parseTurnRequest({
      ...BASE,
      gcsPrefix: "ws/org/agent/extra",
      hostToken: "host-secret",
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-secret",
        heartbeatUrl: "https://gateway.test/heartbeat",
      },
    }),
  ).toThrow("claimed turn has invalid 'gcsPrefix'");
});

test("parseTurnRequest accepts a turnlog seq start and rejects a bad one", () => {
  expect(
    parseTurnRequest({ ...BASE, turnlogSeqStart: 41 }).turnlogSeqStart,
  ).toBe(41);
  expect(parseTurnRequest(BASE).turnlogSeqStart).toBeUndefined();
  for (const bad of [0, -1, 1.5, "41", Number.MAX_SAFE_INTEGER + 2]) {
    expect(() => parseTurnRequest({ ...BASE, turnlogSeqStart: bad })).toThrow(
      "invalid 'turnlogSeqStart'",
    );
  }
});

test("parseTurnRequest carries the hosted turn context and rejects non-strings", () => {
  const parsed = parseTurnRequest({
    ...BASE,
    workspaceContext: "team note",
    userContext: "",
  });
  expect(parsed.workspaceContext).toBe("team note");
  expect(parsed.userContext).toBe("");
  expect(parseTurnRequest(BASE).workspaceContext).toBeUndefined();
  expect(() => parseTurnRequest({ ...BASE, userContext: 5 })).toThrow(
    "invalid 'userContext'",
  );
});

const ROUTINE_BASE = {
  ...BASE,
  text: "",
  hostToken: "ht",
  claim: {
    id: "cl1",
    bootId: "b1",
    token: "t1",
    heartbeatUrl: "http://127.0.0.1/hb",
  },
  routine: { id: "r1" },
};

test("a routine turn may omit text (the worker derives the prompt)", () => {
  expect(parseTurnRequest(ROUTINE_BASE).routine).toEqual({ id: "r1" });
});

test("a non-routine turn still requires text", () => {
  expect(() => parseTurnRequest({ ...BASE, text: "" })).toThrow(
    /missing 'text'/,
  );
});

test("parseTurnRequest carries the turn's pinned provider; junk reads as absent", () => {
  expect(parseTurnRequest({ ...BASE, provider: "openrouter" }).provider).toBe(
    "openrouter",
  );
  expect(parseTurnRequest(BASE).provider).toBeUndefined();
  expect(parseTurnRequest({ ...BASE, provider: "" }).provider).toBeUndefined();
  expect(parseTurnRequest({ ...BASE, provider: 5 }).provider).toBeUndefined();
});

const CLAIMED = {
  ...BASE,
  hostToken: "host-secret",
  claim: {
    id: "claim-1",
    bootId: "boot-1",
    token: "claim-secret",
    heartbeatUrl: "https://gateway.test/heartbeat",
  },
};

test("parseTurnRequest leaves an absent grant absent", () => {
  expect(parseTurnRequest(CLAIMED).grant).toBeUndefined();
});

test("parseTurnRequest accepts and normalizes a claimed turn grant", () => {
  expect(
    parseTurnRequest({
      ...CLAIMED,
      grant: {
        url: "https://gateway.test:8443/",
        token: "acting-v1.secret",
        expires: 1_900_000_000,
        scopes: ["integrations", "future-scope", "agent-writes"],
      },
    }).grant,
  ).toEqual({
    url: "https://gateway.test:8443",
    token: "acting-v1.secret",
    expires: 1_900_000_000,
    scopes: ["integrations", "agent-writes"],
  });
});

test.each([
  ["a malformed URL", { url: "not a url" }],
  ["a non-http URL", { url: "ftp://gateway.test" }],
  ["URL credentials", { url: "https://user:password@gateway.test" }],
  ["a URL path", { url: "https://gateway.test/internal" }],
  ["a URL query", { url: "https://gateway.test?x=1" }],
  ["a URL hash", { url: "https://gateway.test#x" }],
  ["an empty token", { token: "" }],
  ["a zero expiry", { expires: 0 }],
  ["a fractional expiry", { expires: 1.5 }],
  ["a non-array scope list", { scopes: "integrations" }],
  ["an extra key", { extra: true }],
])("rejects a grant with %s", (_case, override) => {
  expect(() =>
    parseTurnRequest({
      ...CLAIMED,
      grant: {
        url: "https://gateway.test",
        token: "acting-v1.secret",
        expires: 1_900_000_000,
        scopes: ["integrations"],
        ...override,
      },
    }),
  ).toThrow("invalid 'grant'");
});

test("a grant requires a claim and is refused on a shadow turn", () => {
  const grant = {
    url: "https://gateway.test",
    token: "acting-v1.secret",
    expires: 1_900_000_000,
    scopes: ["integrations"],
  };
  expect(() => parseTurnRequest({ ...BASE, grant })).toThrow(
    "grant requires a claim",
  );
  expect(() => parseTurnRequest({ ...CLAIMED, shadow: true, grant })).toThrow(
    "shadow turn cannot carry a grant",
  );
});
