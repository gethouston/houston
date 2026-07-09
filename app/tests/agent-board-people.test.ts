import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanItem, KanbanPerson } from "@houston-ai/board";
import type { UserProfile } from "../src/hooks/queries/use-user-profiles.ts";
import {
  attachBoardPeople,
  buildBoardPeopleById,
  type MissionAttribution,
  missionMatchesPerson,
} from "../src/lib/mission-people.ts";

const profiles = (rows: UserProfile[]): Map<string, UserProfile> =>
  new Map(rows.map((r) => [r.userId, r]));

const item = (id: string): KanbanItem => ({
  id,
  title: `Mission ${id}`,
  status: "running",
});

// The per-agent board maps its cards from the activity list (no attribution)
// and joins server-stamped face stacks on by id. These cover that join plus
// the filter semantics the per-agent surface mounts, mirroring the cross-agent
// board's Everyone / Mine / teammate rules.

describe("buildBoardPeopleById", () => {
  it("keys each mission's face stack by its id, creator first", () => {
    const convs: (MissionAttribution & { id: string })[] = [
      { id: "m-1", created_by: "u-a", contributors: [{ user_id: "u-b" }] },
      { id: "m-2", created_by: "u-b" },
    ];
    const byId = buildBoardPeopleById(convs, profiles([]));
    deepStrictEqual(
      byId.get("m-1")?.map((p) => p.id),
      ["u-a", "u-b"],
    );
    deepStrictEqual(
      byId.get("m-2")?.map((p) => p.id),
      ["u-b"],
    );
  });

  it("omits missions with no contributors (no empty entries)", () => {
    const convs: (MissionAttribution & { id: string })[] = [
      { id: "m-1", contributors: [] },
      { id: "m-2" },
      { id: "m-3", created_by: "u-a" },
    ];
    const byId = buildBoardPeopleById(convs, profiles([]));
    strictEqual(byId.has("m-1"), false);
    strictEqual(byId.has("m-2"), false);
    strictEqual(byId.has("m-3"), true);
    strictEqual(byId.size, 1);
  });
});

describe("attachBoardPeople", () => {
  it("empty map is identity pass-through (same array reference)", () => {
    const items = [item("m-1"), item("m-2")];
    const out = attachBoardPeople(items, new Map());
    strictEqual(out, items);
  });

  it("joins face stacks by id, leaving unattributed items untouched", () => {
    const items = [item("m-1"), item("m-2")];
    const people: KanbanPerson[] = [{ id: "u-a", label: "A" }];
    const out = attachBoardPeople(items, new Map([["m-1", people]]));
    deepStrictEqual(out[0].people, people);
    strictEqual(out[1].people, undefined);
  });
});

describe("per-agent person filter — mount semantics", () => {
  // The pipeline the per-agent source mounts: activity cards -> join people ->
  // filter by the selected person (Everyone is a no-op).
  const items = [item("m-1"), item("m-2"), item("m-3")];
  const peopleById = buildBoardPeopleById(
    [
      { id: "m-1", created_by: "me", contributors: [{ user_id: "mate" }] },
      { id: "m-2", created_by: "mate" },
      // m-3 has no attribution — Everyone only.
    ],
    profiles([]),
  );
  const peopled = attachBoardPeople(items, peopleById);
  const applyFilter = (userId: string | null) =>
    userId
      ? peopled.filter((i) => missionMatchesPerson(i.people, userId))
      : peopled;

  it("Everyone shows every mission, attributed or not", () => {
    deepStrictEqual(
      applyFilter(null).map((i) => i.id),
      ["m-1", "m-2", "m-3"],
    );
  });

  it("My missions narrows to the missions I am on", () => {
    deepStrictEqual(
      applyFilter("me").map((i) => i.id),
      ["m-1"],
    );
  });

  it("a teammate narrows to that teammate's missions", () => {
    deepStrictEqual(
      applyFilter("mate").map((i) => i.id),
      ["m-1", "m-2"],
    );
  });

  it("missions without attribution never match a person filter", () => {
    strictEqual(
      applyFilter("me").some((i) => i.id === "m-3"),
      false,
    );
    strictEqual(
      applyFilter("mate").some((i) => i.id === "m-3"),
      false,
    );
  });
});
