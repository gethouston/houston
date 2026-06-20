import { test, expect } from "bun:test";
import type { FileStore } from "./store";
import { composeSkillMd, loadSkillDetail, loadSkills, parseSkillMd, skillKey, slugify } from "./skills";

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
  await store.writeText(skillKey(ROOT, "weekly-report"), HOUSTON_SKILL.replace("research-company", "weekly-report"));
  await store.writeText(skillKey(ROOT, "research-company"), HOUSTON_SKILL);
  await store.writeText(skillKey(ROOT, "broken"), "no frontmatter at all");
  // A nested helper file must not register as a skill of its own.
  await store.writeText(`${ROOT}/.agents/skills/research-company/helpers/notes.md`, "x");

  const { items, diagnostics } = await loadSkills(store, ROOT);
  expect(items.map((s) => s.name)).toEqual(["research-company", "weekly-report"]);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]!.message).toContain("broken");
});

test("list + load use the directory slug when frontmatter name: drifts (HOU-515)", async () => {
  // An agent-authored SKILL.md can carry a display phrase in `name:` while
  // living in a kebab-slug directory. loadSkills must report the DIRECTORY slug
  // — the id loadSkillDetail / the host's GET-by-slug route resolve by — or the
  // UI round-trip (list -> click -> load) hard-errors "skill not found".
  const store = memStore();
  const slug = "redactar-outreach-esg";
  await store.writeText(
    skillKey(ROOT, slug),
    "---\nname: Redactar Outreach ESG\ndescription: Draft ESG outreach\n---\n\n## Procedure\nDraft it.\n",
  );

  // list reports the directory slug, not the drifted frontmatter phrase.
  const { items } = await loadSkills(store, ROOT);
  expect(items.map((s) => s.name)).toEqual([slug]);

  // The id list handed back round-trips cleanly through loadSkillDetail.
  const detail = await loadSkillDetail(store, ROOT, slug);
  expect(detail!.name).toBe(slug);
  expect(detail!.content).toContain("Draft it.");

  // The drifted phrase never named a real directory — still null (-> host 404).
  expect(await loadSkillDetail(store, ROOT, "Redactar Outreach ESG")).toBeNull();
});

test("parseSkillMd pins name to the directory slug, ignoring a drifted frontmatter name: (HOU-515)", () => {
  const parsed = parseSkillMd(
    "redactar-outreach-esg",
    "---\nname: Redactar Outreach ESG\ndescription: x\n---\n\nbody\n",
  );
  if ("error" in parsed) throw new Error(parsed.error);
  expect(parsed.summary.name).toBe("redactar-outreach-esg");
  expect(parsed.summary.description).toBe("x");
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
  await store.writeText(skillKey(ROOT, "broken"), "just a body, no frontmatter");
  const detail = await loadSkillDetail(store, ROOT, "broken");
  expect(detail!.name).toBe("broken");
  expect(detail!.content).toContain("just a body");
  expect(await loadSkillDetail(store, ROOT, "ghost")).toBeNull();
});

test("slugify", () => {
  expect(slugify("Research a Company!")).toBe("research-a-company");
  expect(slugify("  Émission spéciale  ")).toBe("mission-sp-ciale");
  expect(slugify("***")).toBe("");
});
