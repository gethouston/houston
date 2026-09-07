import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { describe, expect, test } from "vitest";
import { groupCounts, searchOperations } from "./assistant-search";

const op = (
  name: string,
  group: string,
  description: string,
  withheld: { hidden?: boolean; unroutable?: boolean } = {},
): AssistantOperation => ({
  name,
  group,
  description,
  confirm: false,
  hidden: withheld.hidden ?? false,
  params: [],
  returns: { type: "null" } as AssistantOperation["returns"],
  route: withheld.unroutable
    ? null
    : {
        method: "GET",
        path: `/v1/${name}`,
        pathParams: [],
        query: {},
        body: null,
        bodyFields: null,
      },
});

const catalog: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
    op("listRoutines", "routines", "List an agent's scheduled routines."),
    op("createRoutine", "routines", "Schedule new recurring work."),
    op("deleteRoutine", "routines", "Remove a routine for good."),
    op("listOrgs", "org", "The spaces the caller belongs to."),
    op("addOrgMember", "org", "Invite somebody by email."),
    op("rotateSecret", "internal", "Withheld entirely.", { hidden: true }),
    op("exportLedger", "billing", "No route was derived for this one.", {
      unroutable: true,
    }),
  ],
};

describe("groupCounts", () => {
  test("counts visible operations per group, largest group first", () => {
    expect(groupCounts(catalog)).toEqual([
      { group: "routines", count: 3 },
      { group: "org", count: 2 },
    ]);
  });

  // A withheld operation must not even leak as a count: a group whose only
  // member is withheld would otherwise advertise a group with nothing callable
  // in it. `route: null` counts as withheld — the host cannot dispatch it.
  test.each([
    "internal",
    "billing",
  ])("a group holding only withheld operations (%s) does not appear", (group) => {
    expect(groupCounts(catalog).map((g) => g.group)).not.toContain(group);
  });
});

describe("searchOperations", () => {
  test("matches names case-insensitively", () => {
    const found = searchOperations(catalog, { query: "ROUTINE" });
    expect(found.operations.map((o) => o.name)).toEqual([
      "listRoutines",
      "createRoutine",
      "deleteRoutine",
    ]);
    expect(found.matched).toBe(3);
    expect(found.total).toBe(5);
    expect(found.truncated).toBe(false);
  });

  test("matches description text, not just names", () => {
    expect(
      searchOperations(catalog, { query: "email" }).operations.map(
        (o) => o.name,
      ),
    ).toEqual(["addOrgMember"]);
  });

  test("an empty query with a group lists that whole group", () => {
    const found = searchOperations(catalog, { group: "org" });
    expect(found.operations.map((o) => o.name)).toEqual([
      "listOrgs",
      "addOrgMember",
    ]);
    expect(found.matched).toBe(2);
  });

  test("group narrows a query rather than widening it", () => {
    expect(
      searchOperations(catalog, { query: "list", group: "org" }).operations.map(
        (o) => o.name,
      ),
    ).toEqual(["listOrgs"]);
  });

  // Hidden is policy; `route: null` is capability. Both are absent from the
  // index for the same reason: the agent must not offer what it cannot do.
  test.each([
    "rotateSecret",
    "exportLedger",
  ])("never returns the withheld operation %s, whatever the query", (name) => {
    expect(searchOperations(catalog, { query: name }).matched).toBe(0);
    expect(
      searchOperations(catalog, { query: "" }).operations.map((o) => o.name),
    ).not.toContain(name);
  });

  test("the summary withholds schemas — houston_describe is what has them", () => {
    const [first] = searchOperations(catalog, { query: "listOrgs" }).operations;
    expect(Object.keys(first).sort()).toEqual([
      "confirm",
      "description",
      "group",
      "name",
    ]);
  });

  // A broad match over the real catalog would otherwise spend more context than
  // the answer is worth, so the cap is part of the contract, not a detail.
  test("caps the returned list and says it trimmed", () => {
    const found = searchOperations(catalog, { query: "" }, 2);
    expect(found.operations).toHaveLength(2);
    expect(found.matched).toBe(5);
    expect(found.truncated).toBe(true);
  });
});
