import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { skillPreviewSections } from "../src/skill-preview-sections-model.ts";
import type { CommunitySkillPreview } from "../src/types.ts";

function preview(
  over: Partial<CommunitySkillPreview> = {},
): CommunitySkillPreview {
  return {
    title: null,
    description: "",
    image: null,
    category: null,
    tags: [],
    integrations: [],
    content: null,
    ...over,
  };
}

describe("skillPreviewSections", () => {
  it("renders nothing extra for a bare preview", () => {
    const s = skillPreviewSections(preview());
    assert.deepEqual(s, {
      category: null,
      tags: [],
      integrations: [],
      instructions: null,
    });
  });

  it("treats a missing preview as no sections", () => {
    assert.deepEqual(skillPreviewSections(null), {
      category: null,
      tags: [],
      integrations: [],
      instructions: null,
    });
  });

  it("keeps the authored category, trimmed", () => {
    assert.equal(
      skillPreviewSections(preview({ category: "  Sales " })).category,
      "Sales",
    );
  });

  it("hides a blank category rather than showing an empty chip", () => {
    assert.equal(
      skillPreviewSections(preview({ category: "   " })).category,
      null,
    );
  });

  it("drops blank and duplicate tags, preserving author order", () => {
    const s = skillPreviewSections(
      preview({ tags: ["crm", " ", "crm", " email ", ""] }),
    );
    assert.deepEqual(s.tags, ["crm", "email"]);
  });

  it("keeps integration slugs in author casing for the app to normalize", () => {
    const s = skillPreviewSections(
      preview({ integrations: [" Gmail ", "slack", "slack"] }),
    );
    assert.deepEqual(s.integrations, ["Gmail", "slack"]);
  });

  it("survives untrusted frontmatter that isn't a list of strings", () => {
    const s = skillPreviewSections(
      preview({
        tags: [1, null] as unknown as string[],
        integrations: "gmail" as unknown as string[],
        category: 7 as unknown as string,
      }),
    );
    assert.deepEqual(s.tags, []);
    assert.deepEqual(s.integrations, []);
    assert.equal(s.category, null);
  });

  it("drops tags that repeat the category, case-insensitively", () => {
    const s = skillPreviewSections(
      preview({ category: "Marketing", tags: ["marketing", "writing"] }),
    );
    assert.equal(s.category, "Marketing");
    assert.deepEqual(s.tags, ["writing"]);
  });

  it("exposes the SKILL.md body only when it has content", () => {
    assert.equal(
      skillPreviewSections(preview({ content: "\n# Steps\n\n1. Do it\n" }))
        .instructions,
      "# Steps\n\n1. Do it",
    );
    assert.equal(
      skillPreviewSections(preview({ content: "\n \n" })).instructions,
      null,
    );
    assert.equal(
      skillPreviewSections(preview({ content: null })).instructions,
      null,
    );
  });
});
