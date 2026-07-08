import { expect, test } from "vitest";
import {
  CUSTOM_PROVIDER_ID,
  customActionSlug,
  isCustomAction,
  isMcpAction,
  MCP_PROVIDER_ID,
  mcpActionRemainder,
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

test("isMcpAction recognizes the MCP_ prefix (case-insensitive)", () => {
  expect(isMcpAction("MCP_ACME_TRACKER_LIST_ISSUES")).toBe(true);
  expect(isMcpAction("mcp_acme_list")).toBe(true);
  expect(isMcpAction("GMAIL_SEND_EMAIL")).toBe(false);
  expect(isMcpAction("MYMCP_X")).toBe(false);
});

test("mcpActionRemainder strips the MCP_ prefix, lowercased", () => {
  expect(mcpActionRemainder("MCP_ACME_TRACKER_LIST_ISSUES")).toBe(
    "acme_tracker_list_issues",
  );
  expect(mcpActionRemainder("MCP_X_DO")).toBe("x_do");
  // Not an MCP action, or nothing after the prefix → null.
  expect(mcpActionRemainder("GMAIL_SEND_EMAIL")).toBeNull();
  expect(mcpActionRemainder("MCP_")).toBeNull();
});

test("providerForAction: MCP_ routes to mcp when registered, else the default", () => {
  expect(
    providerForAction("MCP_ACME_LIST", ["composio", MCP_PROVIDER_ID]),
  ).toBe("mcp");
  // CUSTOM_ and MCP_ are independent branches over the same registry.
  expect(
    providerForAction("CUSTOM_ACME_REQUEST", [
      "composio",
      CUSTOM_PROVIDER_ID,
      MCP_PROVIDER_ID,
    ]),
  ).toBe("custom");
  // No mcp provider registered → default (first) provider, never a throw.
  expect(providerForAction("MCP_ACME_LIST", ["composio"])).toBe("composio");
});
