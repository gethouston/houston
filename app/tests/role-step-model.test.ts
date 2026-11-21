import assert from "node:assert/strict";
import test from "node:test";
import { isChoiceSearchable } from "../src/components/shell/choice-step-model.ts";
import {
  ROLE_SEARCH_REACH,
  roleRunsForQuery,
  SELF_ROLE_SEARCH_REACH,
  selfRoleRunsForQuery,
} from "../src/components/shell/role-step-model.ts";
import {
  AGENT_ROLE_IDS,
  type AgentRoleId,
  rolesForContext,
} from "../src/lib/agent-role-catalog.ts";
import {
  LEADERSHIP_ROLE_IDS,
  type LeadershipRoleId,
} from "../src/lib/leadership-roles.ts";
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
  const { own, common } = rolesForContext("freight_logistics");
  assert.ok(!own.includes("bookkeeper") && !common.includes("bookkeeper"));

  const sections = runs("freight_logistics", "bookkeep");
  assert.deepEqual(
    sections.map((section) => section.id),
    ["other"],
  );
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
  const shared = idsOf(runs(null, "project coordinator"));
  assert.equal(new Set(shared).size, shared.length);
  assert.ok(shared.includes("project_coordinator"));
});

test("searching stays accent-blind and case-blind across the catalog", () => {
  const ids = idsOf(runs("freight_logistics", "  BOOKKEEPER  "));
  assert.equal(ids[0], "bookkeeper");
  assert.ok(
    ids.every((id) => id.includes("bookkeeper")),
    ids.join(","),
  );
});

test("a query nothing matches leaves no runs for the empty state to hide", () => {
  assert.deepEqual(runs("freight_logistics", "falconer"), []);
  const reachable = new Set(
    AGENT_ROLE_IDS.flatMap((id) => idsOf(runs("freight_logistics", ROLES[id]))),
  );
  for (const id of AGENT_ROLE_IDS) assert.ok(reachable.has(id), id);
});

const POSITIONS: Record<string, string> = en.roleSetup.leadershipRoles;
const selfRuns = (context: "freight_logistics" | null, query: string) =>
  selfRoleRunsForQuery(context, query, {
    ...LABELS,
    leadershipRole: (id: LeadershipRoleId) => POSITIONS[id],
    leadership: "Leadership",
    context: "Freight & logistics",
  });
const headings = (sections: ReturnType<typeof runs>) =>
  sections.map((section) => [section.id, section.label]);

test("the person's own role leads with every leadership position, in order", () => {
  const sections = selfRuns("freight_logistics", "");
  assert.deepEqual(headings(sections), [
    ["leadership", "Leadership"],
    ["own", "Freight & logistics"],
    ["common", "More roles"],
  ]);
  assert.deepEqual(
    sections[0].options.map((option) => option.id),
    [...LEADERSHIP_ROLE_IDS],
  );
});

test("a typed industry heads its shared jobs under the positions", () => {
  assert.deepEqual(headings(selfRuns(null, "")), [
    ["leadership", "Leadership"],
    ["common", "More roles"],
  ]);
});

test("searching reaches the positions and the jobs alike", () => {
  const sections = selfRuns("freight_logistics", "director");
  assert.equal(sections[0].id, "leadership");
  assert.ok(idsOf(sections).includes("director"));
  assert.ok(idsOf(sections).includes("account_director"));
  assert.ok(sections.every((section) => section.label !== undefined));
  assert.deepEqual(headings(selfRuns("freight_logistics", "CFO")), [
    ["leadership", undefined],
  ]);
  assert.deepEqual(
    selfRuns("freight_logistics", "bookkeep"),
    runs("freight_logistics", "bookkeep"),
  );
  assert.equal(SELF_ROLE_SEARCH_REACH, ROLE_SEARCH_REACH + 18);
});

test("a hire's role runs never offer a leadership position", () => {
  for (const context of ["freight_logistics", null] as const) {
    const ids = new Set(idsOf(runs(context, "")));
    for (const id of LEADERSHIP_ROLE_IDS) assert.equal(ids.has(id), false, id);
    for (const id of LEADERSHIP_ROLE_IDS)
      assert.equal(idsOf(runs(context, POSITIONS[id])).includes(id), false);
  }
});
