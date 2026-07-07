import { expect, test } from "vitest";
import {
  CUSTOM_PROVIDER_ID,
  customActionSlug,
  isCustomAction,
  providerForAction,
} from "./action-routing";

test("isCustomAction recognizes the CUSTOM_ prefix (case-insensitive)", () => {
  expect(isCustomAction("CUSTOM_ACME_REQUEST")).toBe(true);
  expect(isCustomAction("custom_acme_request")).toBe(true);
  expect(isCustomAction("GMAIL_SEND_EMAIL")).toBe(false);
  expect(isCustomAction("MYCUSTOM_X")).toBe(false);
});

test("customActionSlug extracts the (multi-word) slug, lowercased", () => {
  expect(customActionSlug("CUSTOM_ACME_REQUEST")).toBe("acme");
  expect(customActionSlug("CUSTOM_ACME_CRM_REQUEST")).toBe("acme_crm");
  // Not a well-formed CUSTOM_<slug>_REQUEST → no slug.
  expect(customActionSlug("GMAIL_SEND_EMAIL")).toBeNull();
  expect(customActionSlug("CUSTOM_REQUEST")).toBeNull();
  expect(customActionSlug("CUSTOM_ACME_LIST")).toBeNull();
});

test("providerForAction: CUSTOM_ routes to custom when registered", () => {
  expect(
    providerForAction("CUSTOM_ACME_REQUEST", ["composio", CUSTOM_PROVIDER_ID]),
  ).toBe("custom");
  // A composio action always goes to the default (first) provider.
  expect(
    providerForAction("GMAIL_SEND_EMAIL", ["composio", CUSTOM_PROVIDER_ID]),
  ).toBe("composio");
});

test("providerForAction: no custom provider → default first provider", () => {
  expect(providerForAction("CUSTOM_ACME_REQUEST", ["composio"])).toBe(
    "composio",
  );
  expect(providerForAction("GMAIL_SEND_EMAIL", ["composio"])).toBe("composio");
});

test("providerForAction: empty registry throws (never a silent default)", () => {
  expect(() => providerForAction("CUSTOM_ACME_REQUEST", [])).toThrow(
    /no providers registered/,
  );
});
