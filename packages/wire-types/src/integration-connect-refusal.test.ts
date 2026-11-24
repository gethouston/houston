import { expect, test } from "vitest";
import {
  isIntegrationConnectRefusalCode,
  parseIntegrationConnectRefusal,
} from "./integration-connect-refusal";

test("parses each typed connect refusal", () => {
  for (const code of [
    "toolkit_oauth_unavailable",
    "toolkit_no_auth",
    "toolkit_not_found",
  ]) {
    expect(parseIntegrationConnectRefusal({ code, error: "x" })).toEqual({
      code,
      error: "x",
    });
    expect(isIntegrationConnectRefusalCode(code)).toBe(true);
  }
});

test("rejects other codes, a missing error text and non-objects", () => {
  expect(
    parseIntegrationConnectRefusal({ code: "agent_not_found", error: "x" }),
  ).toBeNull();
  expect(
    parseIntegrationConnectRefusal({ code: "toolkit_no_auth" }),
  ).toBeNull();
  expect(parseIntegrationConnectRefusal("toolkit_no_auth")).toBeNull();
  expect(parseIntegrationConnectRefusal(null)).toBeNull();
  expect(isIntegrationConnectRefusalCode(undefined)).toBe(false);
});
