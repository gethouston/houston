import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import { agentPolicyChips } from "../src/components/team-view/agent-policy-chips-model.ts";

const members = [
  { userId: "u-self", email: "you@acme.test", role: "owner" as const },
  { userId: "u-bob", email: "bob@acme.test", role: "user" as const },
];

function agent(assignments: { userId: string; access: "manager" | "user" }[]) {
  return { assignments, assignedUserIds: assignments.map((a) => a.userId) };
}

const settings = (over: {
  allowedToolkits?: string[] | null;
  allowedModels?: string[] | null;
}) => ({ allowedToolkits: null, allowedModels: null, ...over });

describe("agentPolicyChips", () => {
  it("reads the everyone sentinel as Everyone", () => {
    const chips = agentPolicyChips(agent([]), members, settings({}));
    deepStrictEqual(chips.people, { kind: "everyone" });
  });

  it("counts an explicit roster", () => {
    const chips = agentPolicyChips(
      agent([
        { userId: "u-self", access: "manager" },
        { userId: "u-bob", access: "user" },
      ]),
      members,
      settings({}),
    );
    deepStrictEqual(chips.people, { kind: "count", n: 2 });
  });

  it("reads a null ceiling as all and a sized one as a count", () => {
    const chips = agentPolicyChips(
      agent([]),
      members,
      settings({ allowedToolkits: ["gmail", "slack"], allowedModels: null }),
    );
    deepStrictEqual(chips.integrations, { kind: "count", n: 2 });
    deepStrictEqual(chips.models, { kind: "all" });
  });

  it("keeps both ceilings pending without settings", () => {
    const chips = agentPolicyChips(agent([]), members, undefined);
    deepStrictEqual(chips.integrations, { kind: "pending" });
    deepStrictEqual(chips.models, { kind: "pending" });
  });
});
