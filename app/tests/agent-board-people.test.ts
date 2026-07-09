import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanItem, KanbanPerson } from "@houston-ai/board";
import type { UserProfile } from "../src/hooks/queries/use-user-profiles.ts";
import {
  attachBoardPeople,
  buildBoardPeopleById,
  type MissionAttribution,
} from "../src/lib/mission-people.ts";

const profiles = (rows: UserProfile[]): Map<string, UserProfile> =>
  new Map(rows.map((r) => [r.userId, r]));

const item = (id: string): KanbanItem => ({
  id,
  title: `Mission ${id}`,
  status: "running",
});

// The per-agent board maps its cards from the activity list (no attribution)
// and joins server-stamped face stacks on by id. These cover that join; the
// person-scope narrowing applied on top of it lives in agent-person-scope.test.

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
