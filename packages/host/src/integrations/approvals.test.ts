import { expect, test } from "vitest";
import { displayParams, hashActionParams, humanizeParamKey } from "./approvals";

/**
 * The pure approval helpers: `hashActionParams` must be a stable, order-blind
 * fingerprint that still moves on any value drift; `displayParams` must render
 * card-ready rows (truncated, capped, non-strings stringified).
 */

test("hash is stable across object key-order permutations, including nested", () => {
  const a = hashActionParams("GMAIL_SEND", {
    to: "x@y.z",
    body: "hi",
    meta: { cc: "a", bcc: "b" },
  });
  const b = hashActionParams("GMAIL_SEND", {
    meta: { bcc: "b", cc: "a" },
    body: "hi",
    to: "x@y.z",
  });
  expect(a).toBe(b);
  expect(a).toMatch(/^[a-f0-9]{16}$/);
});

test("array order is semantic — reordering an array changes the hash", () => {
  const a = hashActionParams("A", { items: [1, 2, 3] });
  const b = hashActionParams("A", { items: [3, 2, 1] });
  expect(a).not.toBe(b);
});

test("any param drift changes the hash; the action slug is part of it", () => {
  const base = hashActionParams("A", { to: "x" });
  expect(hashActionParams("A", { to: "y" })).not.toBe(base); // value drift
  expect(hashActionParams("A", { to: "x", extra: 1 })).not.toBe(base); // added key
  expect(hashActionParams("B", { to: "x" })).not.toBe(base); // action drift
});

test("displayParams truncates an over-long value to 80 chars + ellipsis", () => {
  const value = "a".repeat(81);
  const note = displayParams({ note: value }).params.Note ?? "";
  expect(note).toBe(`${"a".repeat(80)}…`);
  expect(note.length).toBe(81); // 80 chars + the single ellipsis char
});

test("displayParams passes an exactly-80-char value through untouched", () => {
  const value = "a".repeat(80);
  expect(displayParams({ note: value }).params.Note).toBe(value);
});

test("displayParams caps at the first 8 entries by original key order", () => {
  const params: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++) params[`k${i}`] = i;
  const { params: rows } = displayParams(params);
  expect(Object.keys(rows)).toEqual([
    "K0",
    "K1",
    "K2",
    "K3",
    "K4",
    "K5",
    "K6",
    "K7",
  ]);
});

test("displayParams reports how many entries were dropped past the 8 cap", () => {
  const params: Record<string, unknown> = {};
  for (let i = 0; i < 12; i++) params[`k${i}`] = i;
  expect(displayParams(params).omitted).toBe(4); // 12 - 8
});

test("displayParams reports omitted:0 when nothing is capped", () => {
  expect(displayParams({ a: 1, b: 2 }).omitted).toBe(0);
});

test("displayParams stringifies non-string values", () => {
  const { params: rows } = displayParams({
    n: 42,
    b: true,
    o: { a: 1 },
    arr: [1, 2],
  });
  // humanizeParamKey capitalizes single-word keys.
  expect(rows).toEqual({ N: "42", B: "true", O: '{"a":1}', Arr: "[1,2]" });
});

test("displayParams hides internal plumbing keys and humanizes the rest", () => {
  const { params, omitted } = displayParams({
    user_id: "me",
    connectedAccountId: "ca_123",
    draft_id: "r-3003489618794597896",
    to: "john@acme.com",
  });
  expect(params).toEqual({
    "Draft id": "r-3003489618794597896",
    To: "john@acme.com",
  });
  // Hidden plumbing is noise, not an omission the card must disclose.
  expect(omitted).toBe(0);
});

test("humanizeParamKey handles snake_case, camelCase, and kebab-case", () => {
  expect(humanizeParamKey("draft_id")).toBe("Draft id");
  expect(humanizeParamKey("maxResults")).toBe("Max results");
  expect(humanizeParamKey("thread-id")).toBe("Thread id");
});
