import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
    const skills = read(
      "../src/components/agent/agent-admin/agent-admin-skills.tsx",
    );
    ok(!skills.includes("PageHero"), "no second title over the surface");
    ok(skills.includes("<SkillsBody"), "the shared surface is the section");
  });

  it("Teamwork opens in the plain access column without a hero", () => {
    const sections = read(
      "../src/components/agent-settings/agent-settings-section.tsx",
    );
    const teamwork = sections
      .split('case "delegation":')[1]
      ?.split('case "manage":')[0];
    ok(teamwork?.includes("<AccessColumn>"));
    ok(!teamwork?.includes("HeroAccessColumn"));
    ok(!teamwork?.includes("PageHero"));
  });

  it("a skill opened from the rail titles itself below that lozenge", () => {
    const header = read(
      "../src/components/skills-view/skill-editor-header.tsx",
    );
    ok(/level=\{2\}/.test(header), "the editable title is an h2");
  });
});
