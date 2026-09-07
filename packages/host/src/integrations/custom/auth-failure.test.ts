import { expect, test } from "vitest";
import { looksLikeAuthFailure } from "./auth-failure";
import { unwrapExecutorResult } from "./provider";

/** The exact body HighLevel's MCP server returns for a wrong Private
 *  Integration Token — inside an `isError` tool result, HTTP 200. */
const HIGHLEVEL_BAD_PIT =
  '{\n  "success": false,\n  "status": 401,\n  "data": {\n    "statusCode": 401,\n    "message": "Invalid Private Integration token"\n  },\n  "tool": {\n    "name": "opportunities_get-pipelines"\n  }\n}';

test("recognizes a rejected credential reported inside a tool result", () => {
  for (const text of [
    HIGHLEVEL_BAD_PIT,
    '{"statusCode":401,"message":"Unauthorized"}',
    "Request failed with status 401",
    "HTTP 401 Unauthorized",
    "401 Unauthorized",
    "API key is invalid",
    "Your access token has expired",
    "invalid api_key",
    "The bearer token was revoked",
  ]) {
    expect(looksLikeAuthFailure(text), text).toBe(true);
  }
});

test("stays quiet on ordinary failures, permissions answers and look-alikes", () => {
  for (const text of [
    "contact not found",
    "Contact 401 not found",
    "Invalid key in JSON object",
    "Unauthorized to modify this record",
    "Forbidden: missing scope contacts.write",
    "status 403",
    "order 14010 shipped",
    "invalid email address",
    "validation failed: key is required",
    "token limit exceeded",
  ]) {
    expect(looksLikeAuthFailure(text), text).toBe(false);
  }
});

test("unwrapExecutorResult adds the key-entry hint only for an MCP in-result refusal", () => {
  const failed = (message: string, code = "mcp_tool_error") =>
    unwrapExecutorResult("tools.highlevel.contacts_get-contacts", {
      ok: false,
      error: { code, message },
    });
  const refused = failed(HIGHLEVEL_BAD_PIT);
  expect(refused.successful).toBe(false);
  expect(refused.error).toContain("request_credential with that toolkit");
  expect(refused.error).toContain("'highlevel'");
  const ordinary = failed("Contact 401 not found");
  expect(ordinary.error).not.toContain("request_credential");
  // The same text from a non-MCP failure is not reinterpreted.
  const openapi = failed(HIGHLEVEL_BAD_PIT, "http_error");
  expect(openapi.error).not.toContain("request_credential");
});
