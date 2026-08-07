import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Agent, OrgMember } from "@houston-ai/engine-client";
import { accessWidened } from "../src/components/tabs/agent-access-diff.ts";

const member = (userId: string, role: OrgMember["role"]): OrgMember => ({
  userId,
  email: `${userId}@acme.test`,
  role,
});

const MEMBERS = [
  member("u-self", "owner"),
  member("u-bob", "user"),
  member("u-cara", "admin"),
];

const roster = (
  ...assignments: { userId: string; access: "manager" | "user" }[]
): Pick<Agent, "assignments" | "assignedUserIds"> => ({
  assignments,
  assignedUserIds: assignments.map((a) => a.userId),
});

/** The everyone sentinel: assignee fields present, but empty. */
const EVERYONE = roster();
const OWNER_AND_BOB = roster(
  { userId: "u-self", access: "manager" },
  { userId: "u-bob", access: "user" },
);

describe("accessWidened — what actually counts as sharing", () => {
  it("switching to EVERYONE widens, even though the array shrinks to []", () => {
    // The bug this guards: `assignments.length > prev` never fires on the
    // broadest share in the product, because the sentinel is the empty array.
    strictEqual(
      accessWidened({
        before: OWNER_AND_BOB,
        after: EVERYONE,
        members: MEMBERS,
      }),
      true,
    );
  });

  it("materializing an everyone agent does NOT widen (nobody gains access)", () => {
    strictEqual(
      accessWidened({
        before: EVERYONE,
        after: roster(
          { userId: "u-self", access: "manager" },
          { userId: "u-bob", access: "user" },
          { userId: "u-cara", access: "user" },
        ),
        members: MEMBERS,
      }),
      false,
    );
  });

  it("adding a teammate widens", () => {
    strictEqual(
      accessWidened({
        before: roster({ userId: "u-self", access: "manager" }),
        after: OWNER_AND_BOB,
        members: MEMBERS,
      }),
      true,
    );
  });

  it("removing a teammate does not widen", () => {
    strictEqual(
      accessWidened({
        before: OWNER_AND_BOB,
        after: roster({ userId: "u-self", access: "manager" }),
        members: MEMBERS,
      }),
      false,
    );
  });

  it("promoting someone already on the roster is not a share", () => {
    strictEqual(
      accessWidened({
        before: OWNER_AND_BOB,
        after: roster(
          { userId: "u-self", access: "manager" },
          { userId: "u-bob", access: "manager" },
        ),
        members: MEMBERS,
      }),
      false,
    );
  });
});
