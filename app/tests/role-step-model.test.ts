import assert from "node:assert/strict";
import test from "node:test";
import { isChoiceSearchable } from "../src/components/shell/choice-step-model.ts";
import {
  ROLE_SEARCH_REACH,
  roleRunsForQuery,
} from "../src/components/shell/role-step-model.ts";
import {
  AGENT_ROLE_IDS,
  type AgentRoleId,
  rolesForContext,
} from "../src/lib/agent-role-catalog.ts";
import en from "../src/locales/en/agent-onboarding.json" with { type: "json" };

const ROLES: Record<string, string> = en.roleSetup.roles;
const LABELS = {
  role: (id: AgentRoleId) => ROLES[id],
  more: "More roles",
  other: "Other roles",
};

const runs = (context: "freight_logistics" | null, query: string) =>
  roleRunsForQuery(context, query, LABELS);

const idsOf = (sections: ReturnType<typeof runs>) =>
  sections.flatMap((section) => section.options.map((option) => option.id));

test("an empty query offers the context's own jobs, then the shared ones", () => {
  const { own, common } = rolesForContext("freight_logistics");
  assert.deepEqual(
    runs("freight_logistics", "  ").map((section) => ({
      id: section.id,
      label: section.label,
      options: section.options.map((option) => option.id),
    })),
    [
      { id: "own", label: undefined, options: [...own] },
      { id: "common", label: "More roles", options: [...common] },
    ],
  );
});

test("a typed context is offered the shared run alone, unheaded", () => {
  const { common } = rolesForContext(null);
  const sections = runs(null, "");
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, undefined);
  assert.deepEqual(
    sections[0].options.map((option) => option.id),
    [...common],
  );
});

test("a typed industry still gets the filter, short as its run is", () => {
  // The bug: searchability was read off the run on SCREEN, and an industry the
  // user typed shows the ten shared jobs alone — under the threshold, so the
  // filter vanished and the other ~1150 roles were unreachable.
  const onScreen = runs(null, "").reduce(
    (count, section) => count + section.options.length,
    0,
  );
  assert.ok(onScreen < AGENT_ROLE_IDS.length);
  assert.equal(isChoiceSearchable(onScreen), false);
  assert.equal(isChoiceSearchable(ROLE_SEARCH_REACH), true);
});

test("a typed industry searches the whole catalog, every role reachable", () => {
  const reachable = new Set(
    AGENT_ROLE_IDS.flatMap((id) => idsOf(runs(null, ROLES[id]))),
  );
  for (const id of AGENT_ROLE_IDS) assert.ok(reachable.has(id), id);
});

test("a query reaches jobs filed under every other industry", () => {
  // "Bookkeeper" belongs to accounting; freight neither owns nor shares it.
  const { own, common } = rolesForContext("freight_logistics");
  assert.ok(!own.includes("bookkeeper") && !common.includes("bookkeeper"));

  const sections = runs("freight_logistics", "bookkeep");
  assert.deepEqual(
    sections.map((section) => section.id),
    ["other"],
  );
  // Nothing led it, so the only run carries no heading.
  assert.equal(sections[0].label, undefined);
  assert.ok(idsOf(sections).includes("bookkeeper"));
});

test("the picked context's matches lead, the rest follow under one heading", () => {
  const { own } = rolesForContext("freight_logistics");
  const sections = runs("freight_logistics", "coordinator");

  assert.deepEqual(
    sections.map((section) => section.id),
    ["own", "other"],
  );
  assert.equal(sections[0].label, undefined);
  assert.equal(sections[1].label, "Other roles");
  for (const option of sections[0].options) {
    assert.ok(own.includes(option.id as AgentRoleId), option.id);
  }
  assert.ok(idsOf(sections).includes("onboarding_coordinator"));
});

test("a role is offered once, however many industries hire it", () => {
  const ids = idsOf(runs("freight_logistics", "coordinator"));
  assert.equal(new Set(ids).size, ids.length);
  // "Project coordinator" is both a shared job and software/IT's own.
  const shared = idsOf(runs(null, "project coordinator"));
  assert.equal(new Set(shared).size, shared.length);
  assert.ok(shared.includes("project_coordinator"));
});

test("searching stays accent-blind and case-blind across the catalog", () => {
  const ids = idsOf(runs("freight_logistics", "  BOOKKEEPER  "));
  // Label-sorted, so the bare job leads the qualified ones ("Farm bookkeeper").
  assert.equal(ids[0], "bookkeeper");
  assert.ok(
    ids.every((id) => id.includes("bookkeeper")),
    ids.join(","),
  );
});

test("a query nothing matches leaves no runs for the empty state to hide", () => {
  assert.deepEqual(runs("freight_logistics", "falconer"), []);
  // Every catalog role stays reachable from any context.
  const reachable = new Set(
    AGENT_ROLE_IDS.flatMap((id) => idsOf(runs("freight_logistics", ROLES[id]))),
  );
  for (const id of AGENT_ROLE_IDS) assert.ok(reachable.has(id), id);
});
