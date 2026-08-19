import { expect, test } from "vitest";
import { parseTurnRequest } from "./types";

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
