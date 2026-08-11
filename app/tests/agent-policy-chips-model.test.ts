import { deepStrictEqual, equal } from "node:assert";
import { describe, it } from "node:test";
import type { TFunction } from "i18next";
import {
  type AgentSettingsRead,
  agentPolicyChips,
} from "../src/components/team-view/agent-policy-chips-model.ts";
import { ceilingPolicyValue } from "../src/components/team-view/agent-policy-values.ts";
import en from "../src/locales/en/teams.json" with { type: "json" };

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

/** One agent's read as the fan-out hands it over: data, error, or neither. */
const read = (over: Partial<AgentSettingsRead> = {}): AgentSettingsRead => ({
  data: undefined,
  ...over,
});

/** Resolves keys against the REAL en copy, so a renamed key fails the test. */
const t = ((key: string, options?: { count?: number }) => {
  const count = options?.count;
  const path = key.replace(/^teams:/, "").split(".");
  if (count !== undefined)
    path[path.length - 1] += count === 1 ? "_one" : "_other";
  const value = path.reduce<unknown>(
    (node, part) =>
      typeof node === "object" && node
        ? (node as Record<string, unknown>)[part]
        : undefined,
    en,
  );
  return typeof value === "string"
    ? value.replace("{{count}}", String(count))
    : key;
}) as TFunction<["teams", "agents"]>;

describe("agentPolicyChips", () => {
  it("reads the everyone sentinel as Everyone", () => {
    const chips = agentPolicyChips(
      agent([]),
      members,
      read({ data: settings({}) }),
    );
    deepStrictEqual(chips.people, { kind: "everyone" });
  });

  it("counts an explicit roster", () => {
    const chips = agentPolicyChips(
      agent([
        { userId: "u-self", access: "manager" },
        { userId: "u-bob", access: "user" },
      ]),
      members,
      read({ data: settings({}) }),
    );
    deepStrictEqual(chips.people, { kind: "count", n: 2 });
  });

  it("reads a null ceiling as all and a sized one as a count", () => {
    const chips = agentPolicyChips(
      agent([]),
      members,
      read({
        data: settings({ allowedToolkits: ["gmail", "slack"] }),
      }),
    );
    deepStrictEqual(chips.integrations, { kind: "count", n: 2 });
    deepStrictEqual(chips.models, { kind: "all" });
  });

  it("keeps both ceilings pending while the read is in flight", () => {
    const chips = agentPolicyChips(agent([]), members, read());
    deepStrictEqual(chips.integrations, { kind: "pending" });
    deepStrictEqual(chips.models, { kind: "pending" });
  });

  it("marks both ceilings unavailable when the read failed", () => {
    const chips = agentPolicyChips(
      agent([]),
      members,
      read({ error: new Error("gateway said no") }),
    );
    deepStrictEqual(chips.integrations, { kind: "unavailable" });
    deepStrictEqual(chips.models, { kind: "unavailable" });
  });

  it("keeps showing settings it already holds when a refresh fails", () => {
    const chips = agentPolicyChips(
      agent([]),
      members,
      read({
        data: settings({ allowedModels: ["sonnet"] }),
        error: new Error("refresh failed"),
      }),
    );
    deepStrictEqual(chips.models, { kind: "count", n: 1 });
    deepStrictEqual(chips.integrations, { kind: "all" });
  });
});

describe("ceilingPolicyValue (what the agent row actually shows)", () => {
  const value = (r: AgentSettingsRead) =>
    ceilingPolicyValue(
      t,
      agentPolicyChips(agent([]), members, r).integrations,
      "integrations",
    );

  it("shows nothing while the read is in flight", () => {
    equal(value(read()), undefined);
  });

  it("says it could not load when the read failed", () => {
    const shown = value(read({ error: new Error("nope") }));
    equal(shown, en.teamView.settings.policy.unavailable);
    equal(shown, "Couldn't load");
  });

  it("shows the real ceiling once the read lands", () => {
    equal(
      value(read({ data: settings({ allowedToolkits: ["gmail"] }) })),
      "1 allowed",
    );
    equal(
      value(read({ data: settings({}) })),
      en.teamView.settings.policy.allIntegrations,
    );
  });
});
