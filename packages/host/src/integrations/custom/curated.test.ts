import { expect, test } from "vitest";
import {
  CURATED_ENTRIES,
  type CuratedEntry,
  curatedCanonicalScope,
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
  {
    slug: "highlevel",
    name: "HighLevel",
    description: "HighLevel (GoHighLevel, GHL) CRM and marketing platform.",
    keywords: ["crm", "contactos"],
    aliases: ["gohighlevel", "go high level", "ghl", "leadconnector"],
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

test("an alias resolves as a scope and ranks in search, yielding ONE row", () => {
  for (const app of [
    "ghl",
    "GHL",
    "GoHighLevel",
    "go high level",
    "LeadConnector",
    "highlevel",
  ]) {
    const rows = curatedScoped(app, none, entries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.toolkit).toBe("highlevel");
  }
  expect(curatedScoped("ghl", new Set(["highlevel"]), entries)).toEqual([]);
  const search = curatedMatches(["ghl"], none, entries);
  expect(search.map((row) => row.toolkit)).toEqual(["highlevel"]);
});

test("an alias keeps resolving after the app is added — to the definition, not a stale connectable row", () => {
  const defs = [{ slug: "highlevel", name: "HighLevel", active: true }];
  const tool = {
    address: "highlevel.contacts_create-contact",
    integration: "highlevel",
    name: "contacts_create-contact",
    description: "Create a contact",
  };
  const tools = [tool];
  for (const app of ["ghl", "LeadConnector", "go high level"]) {
    const result = searchCustomTools("create a contact", tools, defs, app);
    expect(result.scope).toBe("resolved");
    expect(result.items.map((m) => m.toolkit)).toEqual(["highlevel"]);
    expect(result.items[0]?.action).not.toBe("");
  }
  // Before the add, the same aliases yield the connectable row.
  const before = searchCustomTools("create a contact", [], [], "ghl");
  expect(before.items).toMatchObject([
    { toolkit: "highlevel", status: "connectable" },
  ]);
  // A user's own integration named like an alias keeps its scope.
  const own = searchCustomTools(
    "create a contact",
    [{ ...tool, integration: "ghl", address: "ghl.contacts" }],
    [{ slug: "ghl", name: "GHL", active: true }, ...defs],
    "ghl",
  );
  expect(own.items.map((m) => m.toolkit)).toEqual(["ghl"]);
  // An alias is never stolen by an unrelated installed substring neighbour.
  const neighbour = searchCustomTools(
    "create a contact",
    [tool, { ...tool, integration: "lead", address: "lead.contacts" }],
    [{ slug: "lead", name: "Lead", active: true }, ...defs],
    "leadconnector",
  );
  expect(neighbour.items.map((m) => m.toolkit)).toEqual(["highlevel"]);
  // Nor by a loose substring of the CANONICAL slug ("Level" ⊂ highlevel).
  const level = searchCustomTools(
    "create a contact",
    [{ ...tool, integration: "level", address: "level.contacts" }],
    [{ slug: "level", name: "Level", active: true }],
    "ghl",
  );
  expect(level.items).toMatchObject([
    { toolkit: "highlevel", status: "connectable" },
  ]);
  // A non-alias scope passes through untouched.
  expect(curatedCanonicalScope("notion")).toBe("notion");
  expect(curatedCanonicalScope("")).toBe("");
});

test("the shipped catalog carries HighLevel as an agent-discoverable CRM", () => {
  const rows = curatedMatches(["crm"], none, CURATED_ENTRIES);
  expect(rows.map((row) => row.toolkit)).toContain("highlevel");
  expect(curatedScoped("gohighlevel", none, CURATED_ENTRIES)).toHaveLength(1);
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
