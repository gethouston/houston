import { describe, expect, it } from "vitest";
import {
  composeTranslatedSkillMd,
  skillTranslateSegments,
} from "./skill-translate";
import { parseSkillMd } from "./skills";

const MD = `---
name: research-company
title: Research a company
description: Deep-dive on pricing and positioning
version: 3
created: 2026-01-10
last_used: 2026-06-01
category: research
featured: true
integrations:
  - tavily
  - gmail
image: magnifying-glass-tilted-left
tags:
  - sales
---

## Procedure

1. Search the company site.
2. Summarize pricing.
`;

describe("skillTranslateSegments", () => {
  it("extracts title, description, and body", () => {
    const segs = skillTranslateSegments("research-company", MD);
    if ("error" in segs) throw new Error(segs.error);
    expect(segs.map((s) => s.id)).toEqual(["title", "description", "body"]);
    expect(segs[1]?.text).toBe("Deep-dive on pricing and positioning");
    expect(segs[2]?.text).toContain("## Procedure");
  });

  it("omits absent surfaces", () => {
    const segs = skillTranslateSegments(
      "bare",
      "---\nname: bare\ndescription: Only this\n---\n\n",
    );
    if ("error" in segs) throw new Error(segs.error);
    expect(segs.map((s) => s.id)).toEqual(["description"]);
  });

  it("refuses a file it cannot parse", () => {
    expect(skillTranslateSegments("x", "no frontmatter here")).toHaveProperty(
      "error",
    );
  });
});

describe("composeTranslatedSkillMd", () => {
  it("splices translations and preserves identity + bookkeeping", () => {
    const out = composeTranslatedSkillMd({
      slug: "research-company",
      original: MD,
      translated: {
        title: "Investigar una empresa",
        description: "Análisis a fondo de precios y posicionamiento",
        body: "## Procedimiento\n\n1. Busca el sitio de la empresa.\n2. Resume los precios.",
      },
    });
    if (typeof out !== "string") throw new Error(out.error);
    const parsed = parseSkillMd("research-company", out);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.summary.title).toBe("Investigar una empresa");
    expect(parsed.summary.description).toBe(
      "Análisis a fondo de precios y posicionamiento",
    );
    expect(parsed.body.trim()).toContain("## Procedimiento");
    // Untouched: identity + bookkeeping + presentation metadata.
    expect(parsed.summary.name).toBe("research-company");
    expect(parsed.summary.version).toBe(3);
    expect(parsed.summary.created).toBe("2026-01-10");
    expect(parsed.summary.lastUsed).toBe("2026-06-01");
    expect(parsed.summary.category).toBe("research");
    expect(parsed.summary.featured).toBe(true);
    expect(parsed.summary.integrations).toEqual(["tavily", "gmail"]);
    expect(parsed.summary.image).toBe("magnifying-glass-tilted-left");
    expect(parsed.summary.tags).toEqual(["sales"]);
  });

  it("keeps original text for surfaces the translator skipped", () => {
    const out = composeTranslatedSkillMd({
      slug: "research-company",
      original: MD,
      translated: { description: "Solo la descripción" },
    });
    if (typeof out !== "string") throw new Error(out.error);
    const parsed = parseSkillMd("research-company", out);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.summary.title).toBe("Research a company");
    expect(parsed.summary.description).toBe("Solo la descripción");
    expect(parsed.body).toContain("Search the company site.");
  });

  it("clamps an over-long translated description", () => {
    const out = composeTranslatedSkillMd({
      slug: "research-company",
      original: MD,
      translated: { description: "x".repeat(400) },
    });
    if (typeof out !== "string") throw new Error(out.error);
    const parsed = parseSkillMd("research-company", out);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.summary.description.length).toBeLessThanOrEqual(256);
  });

  it("refuses an unparseable original", () => {
    expect(
      composeTranslatedSkillMd({
        slug: "x",
        original: "garbage",
        translated: {},
      }),
    ).toHaveProperty("error");
  });
});
