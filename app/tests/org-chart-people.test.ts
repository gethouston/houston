import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { OrgMember } from "@houston/engine-adapter";
import { agentPeople } from "../src/components/organization/org-chart-people.ts";

const members: OrgMember[] = [
  { userId: "julian", role: "owner", displayName: "Julian Arango" },
  { userId: "sara", role: "admin", displayName: "Sara Diaz" },
  { userId: "tom", role: "user", displayName: "Tom Reed" },
  { userId: "ana", role: "user", email: "ana@acme.io" },
];

const shape = (people: ReturnType<typeof agentPeople>) =>
  people && {
    manages: people.manages.map((p) => p.userId),
    uses:
      people.uses === "everyone"
        ? "everyone"
        : people.uses.map((p) => p.userId),
  };

describe("agentPeople", () => {
  it("lists the owner and explicit admin managers, then users by name", () => {
    const people = agentPeople(
      {
        access: "manager",
        assignments: [
          { userId: "tom", access: "user" },
          { userId: "sara", access: "manager" },
          { userId: "ana", access: "user" },
        ],
      },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), {
      manages: ["julian", "sara"],
      uses: ["ana", "tom"],
    });
  });

  it("always lists the owner under Manages, once, first", () => {
    const people = agentPeople(
      {
        access: "manager",
        assignments: [
          { userId: "sara", access: "manager" },
          { userId: "julian", access: "manager" },
          { userId: "tom", access: "user" },
        ],
      },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), {
      manages: ["julian", "sara"],
      uses: ["tom"],
    });
  });

  it("lists the owner when nobody was made manager", () => {
    const people = agentPeople(
      { access: "manager", assignments: [{ userId: "tom", access: "user" }] },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), { manages: ["julian"], uses: ["tom"] });
  });

  it("reads a manager row of a member who is no longer an admin as a user", () => {
    const people = agentPeople(
      {
        access: "manager",
        assignments: [
          { userId: "tom", access: "manager" },
          { userId: "ana", access: "user" },
        ],
      },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), {
      manages: ["julian"],
      uses: ["ana", "tom"],
    });
  });

  it("reads a managed agent with no assignment fields as shared with everyone", () => {
    // The gateway omits an empty assignment list, so an agent shared with
    // everyone arrives with both fields absent even for its manager.
    const people = agentPeople(
      { access: "manager" },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), { manages: ["julian"], uses: "everyone" });
  });

  it("reads the everyone sentinel as one Everyone, not every face", () => {
    const people = agentPeople(
      { access: "manager", assignments: [] },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), { manages: ["julian"], uses: "everyone" });
  });

  it("reads the legacy assignee ids as users", () => {
    const people = agentPeople(
      { access: "manager", assignedUserIds: ["tom"] },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), { manages: ["julian"], uses: ["tom"] });
  });

  it("is null when the caller does not manage the agent", () => {
    strictEqual(
      agentPeople({ access: "user" }, members, "Unnamed account"),
      null,
    );
    strictEqual(
      agentPeople(
        { access: "user", assignments: [{ userId: "tom", access: "user" }] },
        members,
        "Unnamed account",
      ),
      null,
    );
  });

  it("is null when a host that predates access levels withholds the fields", () => {
    strictEqual(agentPeople({}, members, "Unnamed account"), null);
  });

  it("leaves out ids that are no longer on the roster", () => {
    const people = agentPeople(
      {
        access: "manager",
        assignments: [
          { userId: "gone", access: "manager" },
          { userId: "left", access: "user" },
          { userId: "tom", access: "user" },
        ],
      },
      members,
      "Unnamed account",
    );
    deepStrictEqual(shape(people), { manages: ["julian"], uses: ["tom"] });
  });

  it("names people through the shared rule", () => {
    const people = agentPeople(
      { access: "manager", assignments: [{ userId: "ana", access: "user" }] },
      members,
      "Unnamed account",
    );
    strictEqual(
      people?.uses === "everyone" ? null : people?.uses[0]?.name,
      "ana@acme.io",
    );
  });
});
