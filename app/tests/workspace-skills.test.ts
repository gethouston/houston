import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SkillSummary } from "../src/lib/types.ts";
import {
  aggregateWorkspaceSkills,
  filterWorkspaceSkills,
  planSkillAssignment,
  type WorkspaceSkillAgent,
} from "../src/lib/workspace-skills.ts";

const agent = (name: string): WorkspaceSkillAgent => ({
  id: name.toLowerCase(),
  name,
  folderPath: `Ws/${name}`,
});

const skill = (name: string, over?: Partial<SkillSummary>): SkillSummary => ({
  name,
  title: null,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  inputs: [],
  prompt_template: null,
  ...over,
});

const maya = agent("Maya");
const noah = agent("Noah");
const lists = (entries: [WorkspaceSkillAgent, SkillSummary[] | undefined][]) =>
  new Map(entries.map(([a, s]) => [a.folderPath, s]));

describe("aggregateWorkspaceSkills", () => {
  it("collapses copies of the same slug into one row with all holders", () => {
    const rows = aggregateWorkspaceSkills(
      [maya, noah],
      lists([
        [maya, [skill("write-a-brief"), skill("audit-costs")]],
        [noah, [skill("write-a-brief")]],
      ]),
    );
    deepStrictEqual(
      rows.map((r) => [r.slug, r.agents.map((a) => a.name)]),
      [
        ["audit-costs", ["Maya"]],
        ["write-a-brief", ["Maya", "Noah"]],
      ],
    );
  });

  it("keeps the first holder's copy as the display summary", () => {
    const rows = aggregateWorkspaceSkills(
      [maya, noah],
      lists([
        [maya, [skill("write-a-brief", { description: "Maya's copy" })]],
        [noah, [skill("write-a-brief", { description: "Noah's copy" })]],
      ]),
    );
    strictEqual(rows[0].summary.description, "Maya's copy");
  });

  it("treats an agent whose list is still loading as contributing nothing", () => {
    const rows = aggregateWorkspaceSkills(
      [maya, noah],
      lists([
        [maya, [skill("write-a-brief")]],
        [noah, undefined],
      ]),
    );
    deepStrictEqual(
      rows[0].agents.map((a) => a.name),
      ["Maya"],
    );
  });
});

describe("filterWorkspaceSkills", () => {
  const rows = aggregateWorkspaceSkills(
    [maya, noah],
    lists([
      [maya, [skill("write-a-brief", { title: "Redactar un brief" })]],
      [noah, [skill("audit-costs")]],
    ]),
  );

  it("matches display title, slug, and holder name", () => {
    strictEqual(
      filterWorkspaceSkills(rows, "redactar")[0].slug,
      "write-a-brief",
    );
    strictEqual(filterWorkspaceSkills(rows, "audit-")[0].slug, "audit-costs");
    strictEqual(filterWorkspaceSkills(rows, "noah")[0].slug, "audit-costs");
  });

  it("keeps everything on an empty query", () => {
    strictEqual(filterWorkspaceSkills(rows, "  ").length, 2);
  });
});

describe("planSkillAssignment", () => {
  it("writes only newly assigned agents when the content is untouched", () => {
    deepStrictEqual(
      planSkillAssignment({
        contentDirty: false,
        before: ["Ws/Maya"],
        after: ["Ws/Maya", "Ws/Noah"],
      }),
      { writes: ["Ws/Noah"], deletes: [] },
    );
  });

  it("rewrites every assigned agent when the content changed", () => {
    deepStrictEqual(
      planSkillAssignment({
        contentDirty: true,
        before: ["Ws/Maya"],
        after: ["Ws/Maya", "Ws/Noah"],
      }),
      { writes: ["Ws/Maya", "Ws/Noah"], deletes: [] },
    );
  });

  it("deletes unassigned agents and never double-lists them", () => {
    deepStrictEqual(
      planSkillAssignment({
        contentDirty: true,
        before: ["Ws/Maya", "Ws/Noah"],
        after: ["Ws/Noah"],
      }),
      { writes: ["Ws/Noah"], deletes: ["Ws/Maya"] },
    );
  });

  it("no-ops on an unchanged assignment with clean content", () => {
    deepStrictEqual(
      planSkillAssignment({
        contentDirty: false,
        before: ["Ws/Maya"],
        after: ["Ws/Maya"],
      }),
      { writes: [], deletes: [] },
    );
  });
});
