import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Agent Settings a11y guards. The node test runner has no DOM, so (per the
 * repo's React-test idiom) these assert on component source:
 *
 *  1. AccessChoice moves DOM focus to the newly-selected radio on arrow keys
 *     (WAI-ARIA roving-tabindex contract: focus follows selection).
 *  2. The master-detail Agent Settings page renders no <h1> (the minimal
 *     sidebar rail dropped its page title); the right-pane section titles are
 *     <h2>, not <h1>s.
 */

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

describe("Agent Settings a11y", () => {
  it("AccessChoice focuses the newly-selected radio on arrow keys", () => {
    const src = read("../src/components/agent/agent-admin/access-choice.tsx");
    ok(src.includes(".focus()"), "arrow-key handler moves DOM focus");
    ok(src.includes("useRef"), "keeps element refs to focus the checked radio");
  });

  it("section bodies use PageHero level 2 beneath the drilled header", () => {
    const sections = read(
      "../src/components/agent-settings/agent-settings-section.tsx",
    );
    const people = read(
      "../src/components/agent-settings/agent-settings-people-hero.tsx",
    );
    const peopleSection = read(
      "../src/components/agent-settings/agent-settings-people.tsx",
    );
    const learnings = read(
      "../src/components/agent/agent-admin/agent-admin-knowledge.tsx",
    );
    ok(sections.includes("<PageHero"), "shared sections use PageHero");
    ok(sections.includes("level={2}"), "shared hero is an h2");
    ok(people.includes("<PageHero"), "People uses PageHero");
    ok(learnings.includes("<PageHero"), "Learnings uses PageHero");
    ok(
      people.includes("titleId={titleId}"),
      "People hero exposes its title id",
    );
    ok(
      peopleSection.includes("titleId={headingId}"),
      "People hero names its radios",
    );
  });

  it("Skills opens on its tools row, with no hero of its own", () => {
    // The Skills section IS the workspace Skills surface scoped to this
    // employee, and the settings rail already names the place the user opened:
    // a hero here would repeat that title above the section's own search.
    const skills = read(
      "../src/components/agent/agent-admin/agent-admin-skills.tsx",
    );
    ok(!skills.includes("PageHero"), "no second title over the surface");
    ok(skills.includes("<SkillsBody"), "the shared surface is the section");
  });

  it("a skill opened from the rail titles itself below that lozenge", () => {
    // The editor replaces the section in place, and the rail's own lozenge is
    // already the screen's h1 — the skill's name is the level beneath it.
    const header = read(
      "../src/components/skills-view/skill-editor-header.tsx",
    );
    ok(
      /level=\{frame === "inline" \? 2 : 1\}/.test(header),
      "the editable title takes its heading level from the frame",
    );
  });
});
