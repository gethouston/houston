import { expect, test } from "vitest";
import {
  composeInstalledSkillMd,
  MAX_SKILL_DESCRIPTION_LEN,
} from "./skill-install";
import { parseSkillMd } from "./skills";

const TODAY = "2026-07-03";

const AUTHORED = `---
name: Writing Plans
description: Plan multi-step writing work
version: 4
created: 2024-01-01
last_used: 2025-02-02
category: writing
integrations: [gmail]
image: memo
tags: [docs]
---

## Procedure
Do the thing.
`;

test("preserves author frontmatter, resets bookkeeping, features the install", () => {
  const md = composeInstalledSkillMd({
    slug: "writing-plans",
    rawMd: AUTHORED,
    fallbackDescription: "fallback",
    todayIsoDate: TODAY,
  });
  const parsed = parseSkillMd("writing-plans", md);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.name).toBe("writing-plans");
  expect(parsed.summary.description).toBe("Plan multi-step writing work");
  expect(parsed.summary.version).toBe(1);
  expect(parsed.summary.created).toBe(TODAY);
  expect(parsed.summary.lastUsed).toBe(TODAY);
  expect(parsed.summary.featured).toBe(true);
  expect(parsed.summary.category).toBe("writing");
  expect(parsed.summary.integrations).toEqual(["gmail"]);
  expect(parsed.summary.image).toBe("memo");
  expect(parsed.summary.tags).toEqual(["docs"]);
  expect(parsed.body).toContain("Do the thing.");
});

test("bare SKILL.md without frontmatter installs with the fallback description", () => {
  const md = composeInstalledSkillMd({
    slug: "bare-skill",
    rawMd: "# Bare Skill\n\nJust instructions.",
    fallbackDescription: "fallback desc",
    todayIsoDate: TODAY,
  });
  const parsed = parseSkillMd("bare-skill", md);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.description).toBe("fallback desc");
  expect(parsed.summary.featured).toBe(true);
  expect(parsed.body).toContain("# Bare Skill");
});

test("empty author description falls back, long description is clamped", () => {
  const long = "x".repeat(MAX_SKILL_DESCRIPTION_LEN + 50);
  const md = composeInstalledSkillMd({
    slug: "clamp-me",
    rawMd: `---\nname: clamp-me\ndescription: ${long}\n---\n\nbody`,
    fallbackDescription: "unused",
    todayIsoDate: TODAY,
  });
  const parsed = parseSkillMd("clamp-me", md);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.description.length).toBeLessThanOrEqual(
    MAX_SKILL_DESCRIPTION_LEN,
  );

  const empty = composeInstalledSkillMd({
    slug: "no-desc",
    rawMd: "---\nname: no-desc\n---\n\nbody",
    fallbackDescription: "from fallback",
    todayIsoDate: TODAY,
  });
  const p2 = parseSkillMd("no-desc", empty);
  if ("error" in p2) throw new Error(p2.error);
  expect(p2.summary.description).toBe("from fallback");
});

test("frontmatter name never survives — the slug owns identity", () => {
  const md = composeInstalledSkillMd({
    slug: "ai-sdk",
    rawMd: "---\nname: Totally Different\ndescription: d\n---\n\nbody",
    fallbackDescription: "f",
    todayIsoDate: TODAY,
  });
  expect(md).toContain("name: ai-sdk");
  expect(md).not.toContain("Totally Different");
});
