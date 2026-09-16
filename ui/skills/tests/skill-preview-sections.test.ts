import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { skillPreviewSections } from "../src/skill-preview-sections-model.ts";
import type { PreviewSkillDetail } from "../src/types.ts";

function preview(over: Partial<PreviewSkillDetail> = {}): PreviewSkillDetail {
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
      workflow: [],
    });
  });

  it("treats a missing preview as no sections", () => {
    assert.deepEqual(skillPreviewSections(null), {
      category: null,
      tags: [],
      integrations: [],
      instructions: null,
      workflow: [],
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

describe("skillPreviewSections workflow", () => {
  it("keeps a Houston skill's parsed steps, trimmed", () => {
    assert.deepEqual(
      skillPreviewSections(
        preview({
          workflow: [
            {
              title: "  Read the playbook  ",
              detail: "  Load context.  ",
              integration: null,
            },
            { title: "Send it", detail: null, integration: null },
          ],
        }),
      ).workflow,
      [
        {
          title: "Read the playbook",
          detail: "Load context.",
          integration: null,
        },
        { title: "Send it", detail: null, integration: null },
      ],
    );
  });

  it("keeps the app a step acts on, trimmed, action and all", () => {
    assert.deepEqual(
      skillPreviewSections(
        preview({
          workflow: [
            {
              title: "Send it",
              detail: null,
              integration: { toolkit: " gmail ", action: " GMAIL_SEND_EMAIL " },
            },
          ],
        }),
      ).workflow[0]?.integration,
      { toolkit: "gmail", action: "GMAIL_SEND_EMAIL" },
    );
  });

  it("drops an app tag with no toolkit rather than chipping a blank one", () => {
    const workflow = skillPreviewSections(
      preview({
        workflow: [
          {
            title: "Send it",
            detail: null,
            integration: { toolkit: "  ", action: "SEND" },
          },
          {
            title: "File it",
            detail: null,
            integration: "gmail" as unknown as { toolkit: string },
          },
        ] as never,
      }),
    ).workflow;
    assert.equal(workflow[0]?.integration, null);
    assert.equal(workflow[1]?.integration, null);
  });

  it("leaves an imported skill with no steps, so the raw body stays primary", () => {
    assert.deepEqual(skillPreviewSections(preview()).workflow, []);
    assert.deepEqual(
      skillPreviewSections(preview({ workflow: null })).workflow,
      [],
    );
  });

  it("drops a step the parser could not title", () => {
    assert.deepEqual(
      skillPreviewSections(
        preview({
          workflow: [{ title: "   ", detail: "orphan", integration: null }],
        }),
      ).workflow,
      [],
    );
  });
});
