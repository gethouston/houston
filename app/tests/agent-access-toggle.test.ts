import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { assignmentToggle } from "../src/components/tabs/agent-access-model.ts";

const MEMBERS = ["alice", "bob", "carol"];

describe("assignmentToggle", () => {
  it("toggling someone ON adds them to an explicit set", () => {
    deepStrictEqual(
      assignmentToggle({
        memberIds: MEMBERS,
        assigned: new Set(["alice"]),
        userId: "bob",
        on: true,
      }),
      { kind: "set", userIds: ["alice", "bob"] },
    );
  });

  it("toggling someone OFF removes them from an explicit set", () => {
    deepStrictEqual(
      assignmentToggle({
        memberIds: MEMBERS,
        assigned: new Set(["alice", "bob"]),
        userId: "bob",
        on: false,
      }),
      { kind: "set", userIds: ["alice"] },
    );
  });

  it("everyone mode (empty set) expands to the full roster minus the toggled member", () => {
    deepStrictEqual(
      assignmentToggle({
        memberIds: MEMBERS,
        assigned: new Set(),
        userId: "bob",
        on: false,
      }),
      { kind: "set", userIds: ["alice", "carol"] },
    );
  });

  it("toggling OFF the last assigned member asks for confirmation instead of PUTting []", () => {
    // Empty assignedUserIds means "everyone in the org" (host convention), so
    // this click would silently WIDEN access — it must be confirm-gated.
    deepStrictEqual(
      assignmentToggle({
        memberIds: MEMBERS,
        assigned: new Set(["bob"]),
        userId: "bob",
        on: false,
      }),
      { kind: "confirmOpenToAll" },
    );
  });

  it("a one-member org toggling that member off also confirm-gates", () => {
    deepStrictEqual(
      assignmentToggle({
        memberIds: ["alice"],
        assigned: new Set(),
        userId: "alice",
        on: false,
      }),
      { kind: "confirmOpenToAll" },
    );
  });

  it("toggling ON never confirm-gates, even from an empty roster expansion", () => {
    deepStrictEqual(
      assignmentToggle({
        memberIds: MEMBERS,
        assigned: new Set(),
        userId: "bob",
        on: true,
      }),
      { kind: "set", userIds: ["alice", "bob", "carol"] },
    );
  });
});
