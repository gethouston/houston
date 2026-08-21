import { expect, test } from "vitest";
import { parseOpRequest } from "./parse-op-request";

test("op.rest must be an op-route shape; a runtime agentfile path is refused", () => {
  const base = {
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "ht",
    claim: { id: "c", bootId: "b", token: "t", heartbeatUrl: "http://x/hb" },
  };
  const routeOp = (rest: string, method = "PUT") => ({
    ...base,
    op: {
      kind: "route",
      method,
      rest,
      contentType: "application/json",
      body: "{}",
    },
  });
  expect(() =>
    parseOpRequest(routeOp("agentfile/data-schema.md")),
  ).not.toThrow();
  expect(() => parseOpRequest(routeOp("routines", "POST"))).not.toThrow();
  expect(() =>
    parseOpRequest(routeOp("agentfile/.houston/runtime/auth.json")),
  ).toThrow(/not an op route/);
  expect(() =>
    parseOpRequest(routeOp("conversations/c1/messages", "POST")),
  ).toThrow(/not an op route/);
});
