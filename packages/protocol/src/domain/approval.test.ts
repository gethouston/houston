import { expect, test } from "vitest";
import { type MessageApproval, parseMessageApprovals } from "./approval";

/**
 * The receipt guard is a TRUST BOUNDARY: everything it returns is treated by
 * the host as something a person clicked. So it fails closed on every shape it
 * does not recognize rather than passing it along.
 */

test("no receipts is the normal state, spelled several ways", () => {
  expect(parseMessageApprovals(undefined)).toEqual([]);
  expect(parseMessageApprovals(null)).toEqual([]);
  expect(parseMessageApprovals([])).toEqual([]);
  expect(parseMessageApprovals("approve")).toEqual([]);
  expect(
    parseMessageApprovals({ requestId: "a", decision: "approve" }),
  ).toEqual([]);
});

test("well-formed receipts survive in order", () => {
  const approvals: MessageApproval[] = [
    { requestId: "a1", decision: "approve" },
    { requestId: "b2", decision: "deny" },
  ];
  expect(parseMessageApprovals(approvals)).toEqual(approvals);
});

test("a malformed entry is dropped, never guessed at", () => {
  expect(
    parseMessageApprovals([
      { requestId: "ok", decision: "approve" },
      { requestId: "", decision: "approve" },
      { requestId: 7, decision: "approve" },
      { requestId: "no-decision" },
      { requestId: "bad-decision", decision: "yes" },
      { requestId: "truthy", decision: true },
      null,
      "approve",
    ]),
  ).toEqual([{ requestId: "ok", decision: "approve" }]);
});
