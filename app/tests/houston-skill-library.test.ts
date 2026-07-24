import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractTemplateSkills,
  withFeaturedFrontmatter,
} from "../src/lib/houston-skill-library.ts";

// The Custom tab's Houston library: the pre-set store agents' packaged
// skills, parsed straight out of a template's seed map and installed by
// writing the SKILL.md verbatim (plus the featured upgrade every explicit
// install gets, so the skill actually shows on the chat empty-state cards).

const SKILL = `---
name: research-an-account
description: "Everything on a company before the call"
category: Sales
featured: no
image: handshake
integrations: [hubspot]
---

# Research an account
Steps.
`;

describe("houston skill library", () => {
  it("extracts skills from a template's seed map, slug-sorted, display fields parsed", () => {
    const seeds = {
      "CLAUDE.md": "instructions",
      ".houston/manifest.json": "{}",
      ".agents/skills/write-a-proposal/SKILL.md": `---\ntitle: "Write a proposal"\ndescription: Draft it\n---\nBody`,
      ".agents/skills/research-an-account/SKILL.md": SKILL,
      // A nested non-top-level file never reads as a skill.
      ".agents/skills/research-an-account/notes/extra.md": "x",
    };
    const skills = extractTemplateSkills("sales", seeds);
    deepStrictEqual(
      skills.map((s) => s.slug),
      ["research-an-account", "write-a-proposal"],
    );
    const research = skills[0];
    ok(research);
    strictEqual(research.agentId, "sales");
    strictEqual(
      research.description,
      "Everything on a company before the call",
    );
    strictEqual(research.image, "handshake");
    deepStrictEqual(research.integrations, ["hubspot"]);
    strictEqual(research.content, SKILL);
    strictEqual(skills[1]?.title, "Write a proposal");
  });

  it("upgrades featured: no to yes, keeping everything else byte-identical", () => {
    const installed = withFeaturedFrontmatter(SKILL);
    ok(installed.includes("featured: yes"));
    ok(!installed.includes("featured: no"));
    strictEqual(installed.replace("featured: yes", "featured: no"), SKILL);
  });

  it("inserts featured when the frontmatter lacks it, body untouched", () => {
    const bare = `---\nname: x\ndescription: d\n---\n\n# Body\nfeatured: no way this line changes\n`;
    const installed = withFeaturedFrontmatter(bare);
    ok(
      installed.startsWith(
        "---\nname: x\ndescription: d\nfeatured: yes\n---\n",
      ),
    );
    ok(installed.endsWith("# Body\nfeatured: no way this line changes\n"));
  });

  it("leaves content without a frontmatter block unchanged", () => {
    strictEqual(
      withFeaturedFrontmatter("# Just markdown\n"),
      "# Just markdown\n",
    );
  });
});
