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
