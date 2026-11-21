import { expect, test } from "vitest";
import { accountBlockedDetail, mintFailureStatus } from "./account-blocked";

const body =
  '{"error_details":{"message":"Your account\'s billing is currently locked because recent account charges have failed. Please update your payment method to restore access.","url":"https://github.com/settings/billing","notification_id":"billing_locked"}}';

test("reads GitHub's sentence out of the nested 403 body", () => {
  expect(accountBlockedDetail(403, body)).toBe(
    "Your account's billing is currently locked because recent account charges have failed. Please update your payment method to restore access.",
  );
});

test("reads it through pi-ai's thrown message, status from the prefix", () => {
  const thrown = `403 Forbidden: ${body}`;
  expect(mintFailureStatus(thrown)).toBe(403);
  expect(accountBlockedDetail(mintFailureStatus(thrown) ?? 0, thrown)).toMatch(
    /^Your account's billing is currently locked/,
  );
});

test("reads the flat message shape too", () => {
  expect(
    accountBlockedDetail(
      403,
      '{"message":"Billing is locked for this account"}',
    ),
  ).toBe("Billing is locked for this account");
});

test("only a 403 qualifies: a 401 or 5xx naming billing is not a block", () => {
  expect(accountBlockedDetail(401, body)).toBeNull();
  expect(accountBlockedDetail(502, body)).toBeNull();
  expect(accountBlockedDetail(0, body)).toBeNull();
  expect(mintFailureStatus("Invalid Copilot token response")).toBeNull();
  expect(mintFailureStatus("fetch failed")).toBeNull();
});

test("a 403 that names no billing lock is not a block", () => {
  expect(
    accountBlockedDetail(
      403,
      '{"error_details":{"message":"You do not have access to GitHub Copilot."}}',
    ),
  ).toBeNull();
  expect(accountBlockedDetail(403, "<html>boom</html>")).toBeNull();
  expect(accountBlockedDetail(403, "")).toBeNull();
});

test("the detail is bounded", () => {
  const long = `{"message":"billing locked ${"x".repeat(500)}"}`;
  expect(accountBlockedDetail(403, long)?.length).toBe(200);
});
