import { expect, test } from "vitest";
import { parseTurnRequest } from "./parse-turn-request";
import { turnSessionRequest } from "./turn-request";

const CLAIMED = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "assistant",
  text: "delete Dobby",
  gcsPrefix: "ws/acme/a551abc",
  hostToken: "turn-v1.x.y",
  actingAs: { userId: "user-1" },
  claim: {
    id: "1",
    bootId: "boot-1",
    token: "2",
    heartbeatUrl: "https://gateway.test/v1/pool/claims/heartbeat",
  },
  grant: {
    url: "https://gateway.test",
    token: "acting-v1.x.y",
    expires: 4102444800,
    scopes: ["agent-writes"],
  },
};
const COORDINATOR = {
  token: "assistant-turn-v1.payload.sig",
  expires: 4102444800,
};

test("a coordinator turn parses with its credential, answers and grants", () => {
  const turn = parseTurnRequest({
    ...CLAIMED,
    coordinator: COORDINATOR,
    approvals: [{ requestId: "r1", decision: "approve" }],
    grants: ["createAgent"],
  });
  expect(turn.coordinator).toEqual(COORDINATOR);
  expect(turn.approvals).toEqual([{ requestId: "r1", decision: "approve" }]);
  expect(turn.grants).toEqual(["createAgent"]);
});

test("the session learns only the role, never the credential", () => {
  const turn = parseTurnRequest({ ...CLAIMED, coordinator: COORDINATOR });
  const session = turnSessionRequest(
    turn,
    "t1",
    () => undefined,
    new AbortController().signal,
  );
  expect(session.role).toBe("coordinator");
  expect(JSON.stringify(session)).not.toContain(COORDINATOR.token);
  const ordinary = turnSessionRequest(
    parseTurnRequest(CLAIMED),
    "t1",
    () => undefined,
    new AbortController().signal,
  );
  expect(ordinary.role).toBeUndefined();
});

test.each([
  ["no claim", { claim: undefined, hostToken: undefined, grant: undefined }],
  ["no grant", { grant: undefined }],
  ["no acting person", { actingAs: undefined }],
  ["a shadow turn", { shadow: true, grant: undefined }],
])("a coordinator turn with %s is refused", (_name, change) => {
  expect(() =>
    parseTurnRequest({ ...CLAIMED, ...change, coordinator: COORDINATOR }),
  ).toThrow(/coordinator/);
});

test.each([
  ["an extra key", { ...COORDINATOR, owner: "user-2" }],
  ["an empty token", { ...COORDINATOR, token: "" }],
  ["a non-numeric expiry", { ...COORDINATOR, expires: "soon" }],
  ["a non-object", "assistant-turn-v1.payload.sig"],
])("a malformed coordinator block (%s) is refused", (_name, coordinator) => {
  expect(() => parseTurnRequest({ ...CLAIMED, coordinator })).toThrow(
    "invalid 'coordinator'",
  );
});

test("answers and grants ride only a coordinator turn", () => {
  expect(() =>
    parseTurnRequest({
      ...CLAIMED,
      approvals: [{ requestId: "r1", decision: "approve" }],
    }),
  ).toThrow("'approvals' requires a coordinator turn");
  expect(() =>
    parseTurnRequest({ ...CLAIMED, grants: ["createAgent"] }),
  ).toThrow("'grants' requires a coordinator turn");
});

test("a grant the message may not carry is refused", () => {
  expect(() =>
    parseTurnRequest({
      ...CLAIMED,
      coordinator: COORDINATOR,
      grants: ["deleteAgent"],
    }),
  ).toThrow("invalid 'grants'");
});
