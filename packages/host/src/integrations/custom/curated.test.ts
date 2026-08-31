import { expect, test } from "vitest";
import {
  CURATED_ENTRIES,
  type CuratedEntry,
  curatedMatches,
  curatedScoped,
} from "./curated";
import { searchCustomTools } from "./search";

/**
 * Curated entries (Croma…) must be AGENT-discoverable before the user adds
 * them: search surfaces each as a connectable app row (the same speech act as
 * an unconnected Composio app), and an explicit `app` scope naming one
 * resolves instead of falling to the unscoped retry. Once added, the curated
 * layer bows out — the compiled definition speaks for itself.
 */

const entries: readonly CuratedEntry[] = [
  {
    slug: "croma",
    name: "Croma",
    description: "Official government records from Colombia, Peru and Mexico.",
    keywords: ["legal", "expediente"],
  },
];

const none = new Set<string>();

test("a query hitting name, description or keywords surfaces the connectable row", () => {
  for (const tokens of [["croma"], ["colombia", "records"], ["expediente"]]) {
    const rows = curatedMatches(tokens, none, entries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "",
      toolkit: "croma",
      connected: false,
      status: "connectable",
    });
  }
});

test("an unrelated query and an empty token list match nothing", () => {
  expect(curatedMatches(["spreadsheet"], none, entries)).toEqual([]);
  expect(curatedMatches([], none, entries)).toEqual([]);
});

test("an added curated slug is excluded — its compiled tools speak instead", () => {
  expect(curatedMatches(["croma"], new Set(["croma"]), entries)).toEqual([]);
});

test("an explicit app scope resolves a curated entry by slug or name", () => {
  for (const app of ["croma", "Croma", "CROMA "]) {
    const rows = curatedScoped(app, none, entries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.toolkit).toBe("croma");
  }
  expect(curatedScoped("notion", none, entries)).toEqual([]);
  expect(curatedScoped("croma", new Set(["croma"]), entries)).toEqual([]);
});

test("searchCustomTools appends the shipped curated rows on the unscoped path", () => {
  const result = searchCustomTools("look up court cases in colombia", [], []);
  const croma = result.items.find((m) => m.toolkit === "croma");
  expect(croma).toMatchObject({ action: "", status: "connectable" });
});

test("searchCustomTools resolves a scoped search for a shipped curated app", () => {
  const result = searchCustomTools("company records", [], [], "croma");
  expect(result.scope).toBe("resolved");
  expect(result.items.map((m) => m.toolkit)).toEqual(["croma"]);
});

test("a scoped search for an unknown app still reports unresolved", () => {
  const result = searchCustomTools("anything", [], [], "definitely-not-an-app");
  expect(result).toEqual({ items: [], scope: "unresolved" });
});

test("shipped entries are slug-safe and self-describing", () => {
  for (const entry of CURATED_ENTRIES) {
    expect(entry.slug).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
    expect(entry.description.length).toBeGreaterThan(20);
    expect(entry.keywords.length).toBeGreaterThan(0);
  }
});
