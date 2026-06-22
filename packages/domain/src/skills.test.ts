import { test, expect } from "bun:test";
import type { FileStore } from "./store";
import {
  composeSkillMd,
  loadSkillDetail,
  loadSkills,
  parseSkillMd,
  skillKey,
  slugify,
} from "./skills";

function memStore(): FileStore {
  const m = new Map<string, string>();
  return {
    async readText(key) {
      return m.get(key) ?? null;
    },
    async writeText(key, content) {
      m.set(key, content);
    },
    async list(prefix) {
      return [...m.keys()].filter((k) => k.startsWith(`${prefix}/`)).sort();
    },
  };
}

const ROOT = "ws/w1/a1/workspace";

const HOUSTON_SKILL = `---
name: research-company
description: Deep-dive on pricing
version: 1
created: 2026-04-25
category: research
featured: yes
image: magnifying-glass-tilted-left
integrations: [tavily, gmail]
---

## Procedure
Step one.
`;

test("parses Houston's existing frontmatter, including YAML-1.1 'featured: yes' and date created", () => {
  const parsed = parseSkillMd("research-company", HOUSTON_SKILL);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.name).toBe("research-company");
  expect(parsed.summary.featured).toBe(true); // 'yes' is a STRING in YAML 1.2 — normalized
  expect(parsed.summary.created).toContain("2026-04-25"); // YAML date scalar → string
  expect(parsed.summary.integrations).toEqual(["tavily", "gmail"]);
  expect(parsed.summary.category).toBe("research");
  expect(parsed.body).toContain("## Procedure");
});

test("loadSkills lists slugs, sorted; broken frontmatter surfaces as a diagnostic", async () => {
  const store = memStore();
  await store.writeText(
    skillKey(ROOT, "weekly-report"),
    HOUSTON_SKILL.replace("research-company", "weekly-report"),
  );
  await store.writeText(skillKey(ROOT, "research-company"), HOUSTON_SKILL);
  await store.writeText(skillKey(ROOT, "broken"), "no frontmatter at all");
  // A nested helper file must not register as a skill of its own.
  await store.writeText(
    `${ROOT}/.agents/skills/research-company/helpers/notes.md`,
    "x",
  );

  const { items, diagnostics } = await loadSkills(store, ROOT);
  expect(items.map((s) => s.name)).toEqual([
    "research-company",
    "weekly-report",
  ]);
  expect(diagnostics).toHaveLength(1);
  const diag = diagnostics[0];
  if (!diag) throw new Error("expected a diagnostic at index 0");
  expect(diag.message).toContain("broken");
});

test("compose → parse round-trip (create flow)", () => {
  const md = composeSkillMd({
    name: "summarize-inbox",
    description: "Summarize unread email",
    content: "## Procedure\nDo the thing.",
    createdIsoDate: "2026-06-12",
  });
  const parsed = parseSkillMd("summarize-inbox", md);
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.name).toBe("summarize-inbox");
  expect(parsed.summary.version).toBe(1);
  expect(parsed.summary.featured).toBe(false);
  expect(parsed.body.trim()).toBe("## Procedure\nDo the thing.");
});

test("loadSkillDetail returns full content; unparseable file still readable (slug fallback)", async () => {
  const store = memStore();
  await store.writeText(
    skillKey(ROOT, "broken"),
    "just a body, no frontmatter",
  );
  const detail = await loadSkillDetail(store, ROOT, "broken");
  if (!detail) throw new Error("expected detail to be non-null for 'broken'");
  expect(detail.name).toBe("broken");
  expect(detail.content).toContain("just a body");
  expect(await loadSkillDetail(store, ROOT, "ghost")).toBeNull();
});

test("slugify", () => {
  expect(slugify("Research a Company!")).toBe("research-a-company");
  expect(slugify("  Émission spéciale  ")).toBe("mission-sp-ciale");
  expect(slugify("***")).toBe("");
});
