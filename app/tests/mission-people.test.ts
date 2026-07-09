import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { KanbanPerson } from "@houston-ai/board";
import type { UserProfile } from "../src/hooks/queries/use-user-profiles.ts";
import {
  buildMissionPeople,
  collectContributorIds,
  distinctBoardPeople,
  iconPersonFor,
  type MissionAttribution,
  missionMatchesPerson,
} from "../src/lib/mission-people.ts";

const profile = (
  userId: string,
  name: string | null,
  avatarUrl: string | null = null,
): UserProfile => ({ userId, name, avatarUrl });

const profiles = (rows: UserProfile[]): Map<string, UserProfile> =>
  new Map(rows.map((r) => [r.userId, r]));

describe("buildMissionPeople — ordering", () => {
  it("creator comes first, then contributors in stored order", () => {
    const conv: MissionAttribution = {
      created_by: "u-creator",
      contributors: [
        { user_id: "u-b" },
        { user_id: "u-a" },
        { user_id: "u-creator" },
      ],
    };
    const people = buildMissionPeople(conv, profiles([]));
    deepStrictEqual(
      people.map((p) => p.id),
      ["u-creator", "u-b", "u-a"],
    );
  });

  it("dedups the creator against the contributor list (creator only once)", () => {
    const conv: MissionAttribution = {
      created_by: "u-1",
      contributors: [
        { user_id: "u-1" },
        { user_id: "u-1" },
        { user_id: "u-2" },
      ],
    };
    deepStrictEqual(
      buildMissionPeople(conv, profiles([])).map((p) => p.id),
      ["u-1", "u-2"],
    );
  });

  it("no creator: contributors in order, still deduped", () => {
    const conv: MissionAttribution = {
      contributors: [
        { user_id: "u-x" },
        { user_id: "u-y" },
        { user_id: "u-x" },
      ],
    };
    deepStrictEqual(
      buildMissionPeople(conv, profiles([])).map((p) => p.id),
      ["u-x", "u-y"],
    );
  });

  it("empty attribution yields no people", () => {
    deepStrictEqual(buildMissionPeople({}, profiles([])), []);
  });
});

describe("buildMissionPeople — label fallbacks", () => {
  it("prefers the profile name over the stored contributor name", () => {
    const conv: MissionAttribution = {
      contributors: [{ user_id: "u-1", name: "Stored Name" }],
    };
    const people = buildMissionPeople(
      conv,
      profiles([profile("u-1", "Profile Name")]),
    );
    strictEqual(people[0].label, "Profile Name");
  });

  it("falls back to the stored contributor name when the profile has none", () => {
    const conv: MissionAttribution = {
      created_by: "u-1",
      contributors: [{ user_id: "u-1", name: "Stored Name" }],
    };
    // profile row exists but its name is null (never set a display name)
    const people = buildMissionPeople(conv, profiles([profile("u-1", null)]));
    strictEqual(people[0].label, "Stored Name");
  });

  it("falls back to an 8-char id slice when neither name is known", () => {
    const conv: MissionAttribution = { created_by: "abcdef0123456789" };
    const people = buildMissionPeople(conv, profiles([]));
    strictEqual(people[0].label, "abcdef01");
  });

  it("uses the profile avatar as imageUrl, omitting it when absent", () => {
    const conv: MissionAttribution = {
      contributors: [{ user_id: "u-1" }, { user_id: "u-2" }],
    };
    const people = buildMissionPeople(
      conv,
      profiles([
        profile("u-1", "A", "https://img/a.png"),
        profile("u-2", "B", null),
      ]),
    );
    strictEqual(people[0].imageUrl, "https://img/a.png");
    strictEqual(people[1].imageUrl, undefined);
    strictEqual("imageUrl" in people[1], false);
  });
});

describe("collectContributorIds", () => {
  it("collects distinct ids across created_by + contributors of all convs", () => {
    const convs: MissionAttribution[] = [
      { created_by: "u-1", contributors: [{ user_id: "u-2" }] },
      {
        created_by: "u-1",
        contributors: [{ user_id: "u-3" }, { user_id: "u-2" }],
      },
      { contributors: [] },
      {},
    ];
    deepStrictEqual(collectContributorIds(convs).sort(), ["u-1", "u-2", "u-3"]);
  });

  it("empty when nothing is attributed", () => {
    deepStrictEqual(collectContributorIds([{}, { contributors: [] }]), []);
  });
});

describe("missionMatchesPerson", () => {
  const people: KanbanPerson[] = [
    { id: "u-1", label: "A" },
    { id: "u-2", label: "B" },
  ];

  it("true when the person is on the stack", () => {
    strictEqual(missionMatchesPerson(people, "u-2"), true);
  });

  it("false when absent or when there is no stack", () => {
    strictEqual(missionMatchesPerson(people, "u-9"), false);
    strictEqual(missionMatchesPerson(undefined, "u-1"), false);
    strictEqual(missionMatchesPerson([], "u-1"), false);
  });
});

describe("iconPersonFor — per-agent card icon fallback chain", () => {
  it("no attribution → undefined (caller shows the agent icon)", () => {
    strictEqual(iconPersonFor(buildMissionPeople({}, profiles([]))), undefined);
    strictEqual(iconPersonFor(undefined), undefined);
    strictEqual(iconPersonFor([]), undefined);
  });

  it("creator only → the creator's face", () => {
    const people = buildMissionPeople(
      { created_by: "u-creator" },
      profiles([]),
    );
    strictEqual(iconPersonFor(people)?.id, "u-creator");
  });

  it("creator + contributors → the most-recently-active (last-appended) contributor", () => {
    // contributors are stored in append order; the last is the latest to join.
    const conv: MissionAttribution = {
      created_by: "u-creator",
      contributors: [{ user_id: "u-early" }, { user_id: "u-latest" }],
    };
    const people = buildMissionPeople(conv, profiles([]));
    strictEqual(iconPersonFor(people)?.id, "u-latest");
  });

  it("carries the resolved label + avatar of the chosen person", () => {
    const conv: MissionAttribution = {
      created_by: "u-1",
      contributors: [{ user_id: "u-2" }],
    };
    const person = iconPersonFor(
      buildMissionPeople(
        conv,
        profiles([profile("u-2", "Latest One", "https://img/2.png")]),
      ),
    );
    strictEqual(person?.label, "Latest One");
    strictEqual(person?.imageUrl, "https://img/2.png");
  });

  // Board-vs-agent-page divergence: the per-agent surface swaps the card icon
  // for this person face; Mission Control never calls iconPersonFor and keeps
  // the shared agent helmet. The contract that makes the swap safe is that a
  // mission WITH people always yields an icon person, and one WITHOUT never
  // does (so the agent avatar remains the fallback on both surfaces).
  it("attributed mission always resolves an icon; unattributed never does", () => {
    const attributed = buildMissionPeople(
      { created_by: "u-1", contributors: [{ user_id: "u-2" }] },
      profiles([]),
    );
    strictEqual(iconPersonFor(attributed) !== undefined, true);
    strictEqual(iconPersonFor(buildMissionPeople({}, profiles([]))), undefined);
  });
});

describe("distinctBoardPeople", () => {
  it("collects distinct people by id, first occurrence wins", () => {
    const items = [
      { people: [{ id: "u-1", label: "A", imageUrl: "a.png" }] },
      {
        people: [
          { id: "u-2", label: "B" },
          { id: "u-1", label: "A dupe" },
        ],
      },
      { people: undefined },
      {},
    ];
    const result = distinctBoardPeople(items);
    deepStrictEqual(
      result.map((p) => p.id),
      ["u-1", "u-2"],
    );
    // first occurrence retained (label "A", not "A dupe")
    strictEqual(result[0].label, "A");
    strictEqual(result[0].imageUrl, "a.png");
  });

  it("empty when no items carry people", () => {
    deepStrictEqual(distinctBoardPeople([{}, { people: [] }]), []);
  });
});
