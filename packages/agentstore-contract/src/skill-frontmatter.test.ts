import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter } from "./skill-frontmatter";

describe("parseSkillFrontmatter", () => {
  it("parses title, description, integrations, image, and category", () => {
    const body = `---
title: Weekly Report
description: Summarize the week.
integrations:
  - GMAIL
  - SLACK
image: https://x.test/i.png
category: productivity
---

# Weekly Report
Do it.`;
    expect(parseSkillFrontmatter(body)).toEqual({
      title: "Weekly Report",
      description: "Summarize the week.",
      integrations: ["GMAIL", "SLACK"],
      image: "https://x.test/i.png",
      category: "productivity",
    });
  });

  it("reads display title from `title:` and NEVER from `name:` (identity is the caller's slug)", () => {
    const body = `---
name: A Drifted Display Phrase
title: The Real Title
---
body`;
    const result = parseSkillFrontmatter(body);
    expect(result.title).toBe("The Real Title");
    // The frontmatter `name:` must not surface anywhere in the parsed output.
    expect(JSON.stringify(result)).not.toContain("Drifted");
  });

  it("coerces a numeric title to a string", () => {
    const body = "---\ntitle: 2026\n---\nx";
    expect(parseSkillFrontmatter(body).title).toBe("2026");
  });

  it("returns defaults when there is no frontmatter", () => {
    expect(parseSkillFrontmatter("# Just markdown, no frontmatter")).toEqual({
      title: null,
      description: "",
      integrations: [],
      image: null,
      category: null,
    });
  });

  it("returns defaults when the frontmatter is invalid YAML", () => {
    const body = "---\ntitle: : : :\n  bad\n---\nx";
    const result = parseSkillFrontmatter(body);
    expect(result.description).toBe("");
    expect(result.integrations).toEqual([]);
  });

  it("defaults a missing description to an empty string", () => {
    const body = "---\ntitle: Only Title\n---\nx";
    expect(parseSkillFrontmatter(body).description).toBe("");
  });
});
