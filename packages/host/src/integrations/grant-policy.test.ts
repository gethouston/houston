import { expect, test } from "vitest";
import {
  actionInToolkit,
  filterMatchesToGranted,
  grantedToolkits,
  normalizeAccountIds,
  resolveExecuteAccount,
  toolkitForAction,
} from "./grant-policy";
import type { ConnectedAccountInfo, ToolMatch } from "./types";

test("actionInToolkit matches the full slug prefix (single- and multi-word)", () => {
  expect(actionInToolkit("GMAIL_SEND_EMAIL", "gmail")).toBe(true);
  expect(actionInToolkit("GOOGLE_MAPS_GET_ROUTE", "google_maps")).toBe(true);
  // A shorter slug must not swallow a different, longer toolkit's actions.
  expect(actionInToolkit("GMAIL_SEND", "gm")).toBe(false);
  expect(actionInToolkit("NOTELY_CREATE", "note")).toBe(false);
});

test("actionInToolkit matches a custom action against its slug EXACTLY", () => {
  // CUSTOM_<SLUG>_REQUEST binds to the toolkit whose slug is exactly <slug>.
  expect(actionInToolkit("CUSTOM_ACME_REQUEST", "acme")).toBe(true);
  expect(actionInToolkit("CUSTOM_ACME_CRM_REQUEST", "acme_crm")).toBe(true);
  // A different custom integration must NOT borrow another's grant, even when
  // one slug is a leading segment of the other (exact match, not prefix).
  expect(actionInToolkit("CUSTOM_ACME_CRM_REQUEST", "acme")).toBe(false);
  // A CUSTOM_ action never matches a composio toolkit.
  expect(actionInToolkit("CUSTOM_ACME_REQUEST", "gmail")).toBe(false);
  // A malformed CUSTOM_ action belongs to no toolkit.
  expect(actionInToolkit("CUSTOM_ACME_LIST", "acme")).toBe(false);
});

test("toolkitForAction resolves a granted custom toolkit by exact slug", () => {
  expect(
    toolkitForAction("CUSTOM_ACME_CRM_REQUEST", ["gmail", "acme_crm"]),
  ).toBe("acme_crm");
  expect(toolkitForAction("CUSTOM_ACME_CRM_REQUEST", ["acme"])).toBeNull();
});

test("actionInToolkit matches an MCP action against its server slug (prefix + tool)", () => {
  // MCP_<SLUG>_<TOOL>: the slug must be a `_`-boundary prefix of the remainder.
  expect(actionInToolkit("MCP_ACME_TRACKER_LIST_ISSUES", "acme_tracker")).toBe(
    true,
  );
  // A shorter server slug also technically prefixes it (longest wins is decided
  // by toolkitForAction, not here).
  expect(actionInToolkit("MCP_ACME_TRACKER_LIST_ISSUES", "acme")).toBe(true);
  // A slug that is not a prefix, or has no trailing tool, does not match.
  expect(actionInToolkit("MCP_ACME_TRACKER_LIST_ISSUES", "acme_trackerx")).toBe(
    false,
  );
  expect(actionInToolkit("MCP_ACME", "acme")).toBe(false);
  // An MCP action never matches a composio/custom toolkit shape.
  expect(actionInToolkit("MCP_ACME_LIST", "gmail")).toBe(false);
});

test("toolkitForAction picks the LONGEST matching MCP server slug", () => {
  // Both "acme" and "acme_tracker" prefix the action; the longer one wins so a
  // shorter server can never borrow a longer server's tools.
  expect(
    toolkitForAction("MCP_ACME_TRACKER_LIST_ISSUES", ["acme", "acme_tracker"]),
  ).toBe("acme_tracker");
  // Order-independent: same winner regardless of grant order.
  expect(
    toolkitForAction("MCP_ACME_TRACKER_LIST_ISSUES", ["acme_tracker", "acme"]),
  ).toBe("acme_tracker");
  // The user owns ONLY "acme" (it is the whole universe) → it legitimately owns
  // the action.
  expect(toolkitForAction("MCP_ACME_TRACKER_LIST_ISSUES", ["acme"])).toBe(
    "acme",
  );
  // No granted server prefixes it → null (denied).
  expect(toolkitForAction("MCP_OTHER_LIST", ["acme_tracker"])).toBeNull();
});

test("toolkitForAction resolves the MCP owner from ALL servers, then checks the grant", () => {
  // The user owns "acme" (granted) AND "acme_tracker" (NOT granted). The true
  // owner of MCP_ACME_TRACKER_* is acme_tracker — a shorter granted "acme" must
  // NOT swallow it just because "acme_" prefixes the remainder. Denied.
  expect(
    toolkitForAction(
      "MCP_ACME_TRACKER_LIST_ISSUES",
      ["acme"],
      ["acme", "acme_tracker"],
    ),
  ).toBeNull();
  // Same universe, but the longer server IS granted → it owns the action.
  expect(
    toolkitForAction(
      "MCP_ACME_TRACKER_LIST_ISSUES",
      ["acme", "acme_tracker"],
      ["acme", "acme_tracker"],
    ),
  ).toBe("acme_tracker");
  // Owner exists but the shorter granted server truly owns a shorter action.
  expect(
    toolkitForAction(
      "MCP_ACME_LIST_ISSUES",
      ["acme"],
      ["acme", "acme_tracker"],
    ),
  ).toBe("acme");
});

test("grantedToolkits derives the distinct toolkit set from accounts", () => {
  expect(
    grantedToolkits([
      { connectionId: "c1", toolkit: "gmail" },
      { connectionId: "c2", toolkit: "gmail" },
      { connectionId: "c3", toolkit: "slack" },
    ]).sort(),
  ).toEqual(["gmail", "slack"]);
});

test("toolkitForAction resolves a granted multi-word toolkit (regression)", () => {
  expect(toolkitForAction("GOOGLE_MAPS_GET_ROUTE", ["google_maps"])).toBe(
    "google_maps",
  );
  expect(toolkitForAction("GMAIL_SEND_EMAIL", ["gmail", "slack"])).toBe(
    "gmail",
  );
  expect(toolkitForAction("GOOGLE_DRIVE_UPLOAD", ["google_maps"])).toBeNull();
});

test("filterMatchesToGranted keeps granted (case-insensitive) + not-connected", () => {
  const matches: ToolMatch[] = [
    {
      action: "GMAIL_SEND",
      toolkit: "Gmail",
      description: "",
      connected: true,
    },
    {
      action: "SLACK_POST",
      toolkit: "slack",
      description: "",
      connected: true,
    },
    {
      action: "NOTION_ADD",
      toolkit: "notion",
      description: "",
      connected: false,
    },
  ];
  expect(
    filterMatchesToGranted(matches, ["gmail"]).map((m) => m.action),
  ).toEqual(["GMAIL_SEND", "NOTION_ADD"]);
});

const accounts: ConnectedAccountInfo[] = [
  { toolkit: "gmail", connectionId: "c1", accountLabel: "Work" },
  { toolkit: "gmail", connectionId: "c2", accountLabel: "Personal" },
];

test("resolveExecuteAccount matches a requested id or label (case-insensitive)", () => {
  expect(resolveExecuteAccount(accounts, "c2")).toEqual({
    ok: true,
    connectionId: "c2",
  });
  expect(resolveExecuteAccount(accounts, "work")).toEqual({
    ok: true,
    connectionId: "c1",
  });
});

test("resolveExecuteAccount: unknown request → account_not_granted", () => {
  expect(resolveExecuteAccount(accounts, "nope")).toEqual({
    ok: false,
    error: "account_not_granted",
  });
});

test("resolveExecuteAccount: single account auto-pins; many require a choice", () => {
  expect(resolveExecuteAccount(accounts.slice(0, 1), undefined)).toEqual({
    ok: true,
    connectionId: "c1",
  });
  expect(resolveExecuteAccount(accounts, undefined)).toEqual({
    ok: false,
    error: "account_required",
    accounts,
  });
});

test("normalizeAccountIds validates + dedupes; rejects non-arrays and empties", () => {
  expect(normalizeAccountIds(["c1", "c1", "c2"])).toEqual({
    ok: true,
    ids: ["c1", "c2"],
  });
  expect(normalizeAccountIds([]).ok).toBe(true);
  expect(normalizeAccountIds("c1").ok).toBe(false);
  expect(normalizeAccountIds([1]).ok).toBe(false);
  expect(normalizeAccountIds([""]).ok).toBe(false);
});
