import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SkillSummary } from "../src/lib/types.ts";
import {
  aggregateSharedSkills,
  filterSharedSkills,
  planManifestAssignment,
} from "../src/lib/workspace-shared-skills.ts";
import type { WorkspaceSkillAgent } from "../src/lib/workspace-skills.ts";

const skill = (name: string, title: string | null = null): SkillSummary => ({
  name,
  title,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  setup_activity_id: null,
  inputs: [],
  prompt_template: null,
});

const agent = (id: string): WorkspaceSkillAgent => ({
  id,
  name: id,
  folderPath: `Work/${id}`,
});

const maya = agent("Maya");
const rex = agent("Rex");

describe("aggregateSharedSkills", () => {
  it("shared rows carry manifest-enabled agents; store copy is the display source", () => {
    const rows = aggregateSharedSkills({
      shared: [skill("brand-voice", "Brand voice")],
      agents: [maya, rex],
      manifestsByPath: new Map([
        [maya.folderPath, ["brand-voice"]],
        [rex.folderPath, []],
      ]),
      listsByPath: new Map([
        [maya.folderPath, []],
        [rex.folderPath, []],
      ]),
    });
    strictEqual(rows.length, 1);
    strictEqual(rows[0]?.origin, "shared");
    deepStrictEqual(
      rows[0]?.agents.map((a) => a.id),
      ["Maya"],
    );
    deepStrictEqual(rows[0]?.overriddenBy, []);
  });

  it("a local copy of a store slug is an override, live even without a manifest entry", () => {
    const rows = aggregateSharedSkills({
      shared: [skill("brand-voice")],
      agents: [maya, rex],
      manifestsByPath: new Map([
        [maya.folderPath, []],
        [rex.folderPath, ["brand-voice"]],
      ]),
      listsByPath: new Map([
        [maya.folderPath, [skill("brand-voice")]],
        [rex.folderPath, []],
      ]),
    });
    strictEqual(rows.length, 1);
    // Rex via manifest, Maya via her shadowing copy — both live.
    deepStrictEqual(rows[0]?.agents.map((a) => a.id).sort(), ["Maya", "Rex"]);
    deepStrictEqual(
      rows[0]?.overriddenBy.map((a) => a.id),
      ["Maya"],
    );
  });

  it("local-only skills aggregate one row per slug across holders, never as overrides", () => {
    const rows = aggregateSharedSkills({
      shared: [],
      agents: [maya, rex],
      manifestsByPath: new Map(),
      listsByPath: new Map([
        [maya.folderPath, [skill("scraping")]],
        [rex.folderPath, [skill("scraping")]],
      ]),
    });
    strictEqual(rows.length, 1);
    strictEqual(rows[0]?.origin, "local");
    deepStrictEqual(
      rows[0]?.agents.map((a) => a.id),
      ["Maya", "Rex"],
    );
    deepStrictEqual(rows[0]?.overriddenBy, []);
  });

  it("a still-loading manifest or list contributes nothing and breaks nothing", () => {
    const rows = aggregateSharedSkills({
      shared: [skill("brand-voice")],
      agents: [maya],
      manifestsByPath: new Map([[maya.folderPath, undefined]]),
      listsByPath: new Map(),
    });
    deepStrictEqual(rows[0]?.agents, []);
  });

  it("rows sort by slug", () => {
    const rows = aggregateSharedSkills({
      shared: [skill("zeta"), skill("alpha")],
      agents: [],
      manifestsByPath: new Map(),
      listsByPath: new Map(),
    });
    deepStrictEqual(
      rows.map((r) => r.slug),
      ["alpha", "zeta"],
    );
  });
});

describe("filterSharedSkills", () => {
  it("matches title, slug, and holder agent name; empty query keeps all", () => {
    const rows = aggregateSharedSkills({
      shared: [skill("brand-voice", "Brand voice")],
      agents: [maya],
      manifestsByPath: new Map([[maya.folderPath, ["brand-voice"]]]),
      listsByPath: new Map(),
    });
    strictEqual(filterSharedSkills(rows, "").length, 1);
    strictEqual(filterSharedSkills(rows, "brand").length, 1);
    strictEqual(filterSharedSkills(rows, "maya").length, 1);
    strictEqual(filterSharedSkills(rows, "nope").length, 0);
  });
});

describe("planManifestAssignment", () => {
  it("diffs enable/disable without any content coupling", () => {
    deepStrictEqual(
      planManifestAssignment({
        before: ["Work/Maya"],
        after: ["Work/Rex"],
      }),
      { enable: ["Work/Rex"], disable: ["Work/Maya"] },
    );
    deepStrictEqual(
      planManifestAssignment({ before: ["Work/Maya"], after: ["Work/Maya"] }),
      { enable: [], disable: [] },
    );
  });
});
