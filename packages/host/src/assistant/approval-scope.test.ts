import { expect, test } from "vitest";
import { approvalKey } from "./approval-key";
import type { ApprovalRequest } from "./approval-record";
import { authorizesApprovalCall, inApprovalScope } from "./approval-scope";

const params = { agent: "Personal/Dobby" };
const request: ApprovalRequest = {
  requestId: "r",
  key: approvalKey("delete_agent", params),
  operation: "delete_agent",
  agentId: "Personal/.assistant",
  conversationId: "assistant",
  summary: "s",
  args: [],
  createdAt: 0,
  expiresAt: 1,
};
const call = {
  requestId: "r",
  operation: "delete_agent",
  params,
  agentId: request.agentId,
  conversationId: request.conversationId,
};

test("a record belongs to exactly one agent, and to one conversation unless asked wider", () => {
  expect(inApprovalScope(request, request.agentId, "assistant")).toBe(true);
  expect(inApprovalScope(request, request.agentId)).toBe(true);
  expect(inApprovalScope(request, request.agentId, "other")).toBe(false);
  expect(inApprovalScope(request, "Personal/Dobby", "assistant")).toBe(false);
  expect(inApprovalScope(request, "Personal/Dobby")).toBe(false);
});

test("only the same call, with the same arguments, in the same place is authorized", () => {
  expect(authorizesApprovalCall(request, call)).toBe(true);
  expect(
    authorizesApprovalCall(request, { ...call, operation: "rename_agent" }),
  ).toBe(false);
  expect(
    authorizesApprovalCall(request, {
      ...call,
      params: { agent: "Personal/Ada" },
    }),
  ).toBe(false);
  expect(
    authorizesApprovalCall(request, { ...call, conversationId: "other" }),
  ).toBe(false);
  expect(
    authorizesApprovalCall(request, { ...call, agentId: "Personal/Dobby" }),
  ).toBe(false);
});
