import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { selectArchived } from "../src/lib/mission-selection.ts";
import { searchMissions } from "../src/components/mission-search.ts";

const missions = [
  {
    id: "a1",
    title: "Refresh quarterly budget",
    description: "Update spreadsheet",
    status: "archived",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "a2",
    title: "Plan team offsite",
    description: "Pick venue and agenda",
    status: "archived",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "active",
    title: "Budget review",
    description: "Live conversation",
    status: "running",
    updatedAt: "2026-01-03T00:00:00Z",
  },
];

describe("archived search wiring", () => {
  it("filters the archived subset before applying search", () => {
    const archived = selectArchived(missions);
    deepStrictEqual(archived.map((m) => m.id), ["a1", "a2"]);

    const result = searchMissions(archived, "budget");
    deepStrictEqual(result.items.map((m) => m.id), ["a1"]);
  });

  it("does not surface active missions even when their title matches", () => {
    const archived = selectArchived(missions);
    const result = searchMissions(archived, "budget review");

    strictEqual(
      result.items.some((m) => m.id === "active"),
      false,
      "active missions must never reach the archived search",
    );
  });

  it("returns the full archived list when the query is empty", () => {
    const archived = selectArchived(missions);
    const result = searchMissions(archived, "");
    strictEqual(result.hasQuery, false);
    deepStrictEqual(result.items.map((m) => m.id), ["a1", "a2"]);
  });
});
