import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { MentionPerson } from "@houston-ai/chat";
import {
  excludeSelf,
  type OrgPersonRow,
  toMentionPeople,
} from "../src/hooks/queries/org-people-map.ts";

// The app half of @mentions (HOU-944): `GET /v1/org/people` gives a sanitized
// co-member directory whose display fields are BOTH optional. These cover the
// projection into `ui/chat`'s MentionPerson, the named-only rule, and the
// composer's self exclusion.

describe("toMentionPeople", () => {
  it("maps displayName -> name and photoUrl -> imageUrl", () => {
    const rows: OrgPersonRow[] = [
      { userId: "u-1", displayName: "Ada Lovelace", photoUrl: "https://a/1" },
    ];
    deepStrictEqual(toMentionPeople(rows), [
      { userId: "u-1", name: "Ada Lovelace", imageUrl: "https://a/1" },
    ]);
  });

  it("omits imageUrl for a member with no photo (initials render instead)", () => {
    const [person] = toMentionPeople([{ userId: "u-1", displayName: "Ada" }]);
    deepStrictEqual(person, { userId: "u-1", name: "Ada" });
    strictEqual("imageUrl" in person, false);
  });

  it("drops a member with no display name — never offers '@a1b2c3d4'", () => {
    const rows: OrgPersonRow[] = [
      { userId: "u-1", displayName: "Ada" },
      { userId: "u-2", photoUrl: "https://a/2" },
      { userId: "u-3", displayName: "Grace" },
    ];
    deepStrictEqual(
      toMentionPeople(rows).map((p) => p.userId),
      ["u-1", "u-3"],
    );
  });

  it("treats a blank / whitespace-only name as no name, and trims the rest", () => {
    const rows: OrgPersonRow[] = [
      { userId: "u-1", displayName: "   " },
      { userId: "u-2", displayName: "" },
      { userId: "u-3", displayName: "  Grace Hopper  " },
    ];
    deepStrictEqual(toMentionPeople(rows), [
      { userId: "u-3", name: "Grace Hopper" },
    ]);
  });

  it("preserves roster order (the gateway already sorts named-first)", () => {
    const rows: OrgPersonRow[] = [
      { userId: "u-z", displayName: "Zoe" },
      { userId: "u-a", displayName: "Ada" },
    ];
    deepStrictEqual(
      toMentionPeople(rows).map((p) => p.name),
      ["Zoe", "Ada"],
    );
  });

  it("degrades to an empty list — the 404 / single-player shape", () => {
    deepStrictEqual(toMentionPeople([]), []);
  });
});

describe("excludeSelf", () => {
  const people: MentionPerson[] = [
    { userId: "u-1", name: "Ada" },
    { userId: "u-2", name: "Grace" },
    { userId: "u-3", name: "Alan" },
  ];

  it("removes the caller — you do not @mention yourself", () => {
    deepStrictEqual(
      excludeSelf(people, "u-2").map((p) => p.userId),
      ["u-1", "u-3"],
    );
  });

  it("keeps the roster identity when the caller is not in it", () => {
    strictEqual(excludeSelf(people, "u-9"), people);
  });

  it("keeps the roster identity when signed out", () => {
    strictEqual(excludeSelf(people, undefined), people);
    strictEqual(excludeSelf(people, null), people);
  });

  it("stays empty for an empty roster", () => {
    const empty: MentionPerson[] = [];
    strictEqual(excludeSelf(empty, "u-1"), empty);
  });
});
