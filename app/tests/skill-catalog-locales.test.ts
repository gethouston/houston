import { ok, strictEqual } from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { humanizeSkillName } from "../src/lib/humanize-skill-name.ts";
import en from "../src/locales/en/skills.json" with { type: "json" };
import es from "../src/locales/es/skills.json" with { type: "json" };
import pt from "../src/locales/pt/skills.json" with { type: "json" };

// `localizeSkillCopy` only localizes a skill whose on-disk description still
// matches the packaged English copy in `en/skills.json:catalog` (the
// edit-detection gate). If the store copy changes without regenerating the
// catalog (`node scripts/gen-skill-catalog-i18n.mjs`) the gate silently stops
// matching and es/pt users quietly see English. This test pins the three
// locale files to the actual store content: a new/renamed/re-described store
// skill fails here until the en reference is regenerated and es/pt
// translations are authored.

const STORE_AGENTS_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "store",
  "agents",
);
const LOCALES = { en, es, pt } as const;

// Mirror of `normalizeSkillCopy` in `app/src/lib/localize-skill-copy.ts`
// (not imported: that module imports JSON without attributes, which Vite
// accepts but bare `node --test` rejects).
const normalizeSkillCopy = (text: string): string => text.replace(/—/g, "-");

interface CatalogEntry {
  name: string;
  description: string;
}
type Catalog = Record<string, Record<string, CatalogEntry>>;

function storeSkillFrontmatterDescription(skillMd: string): string {
  // Store descriptions are single-line double-quoted YAML scalars (the
  // generator parses full YAML; this test only needs the description line).
  const match = skillMd.match(/^description:\s*"((?:[^"\\]|\\.)*)"\s*$/m);
  ok(match, "SKILL.md has a single-line quoted description");
  return JSON.parse(`"${match[1]}"`) as string;
}

function storeSkills(): Array<{
  agentId: string;
  slug: string;
  description: string;
}> {
  const out: Array<{ agentId: string; slug: string; description: string }> = [];
  for (const agentId of readdirSync(STORE_AGENTS_DIR).sort()) {
    let slugs: string[];
    try {
      slugs = readdirSync(
        join(STORE_AGENTS_DIR, agentId, ".agents", "skills"),
      ).sort();
    } catch {
      continue;
    }
    for (const slug of slugs) {
      const md = readFileSync(
        join(STORE_AGENTS_DIR, agentId, ".agents", "skills", slug, "SKILL.md"),
        "utf8",
      );
      out.push({
        agentId,
        slug,
        description: storeSkillFrontmatterDescription(md),
      });
    }
  }
  return out;
}

describe("store skill catalog i18n stays in sync with store/agents", () => {
  const skills = storeSkills();

  it("finds the packaged store skills", () => {
    ok(skills.length > 0, "no store skills found — did store/agents move?");
  });

  it("en catalog mirrors every packaged skill (regenerate with gen-skill-catalog-i18n.mjs)", () => {
    const catalog = (en as { catalog: Catalog }).catalog;
    for (const { agentId, slug, description } of skills) {
      const entry = catalog[agentId]?.[slug];
      ok(entry, `en catalog.${agentId}.${slug} is missing`);
      strictEqual(
        entry.description,
        normalizeSkillCopy(description),
        `en catalog.${agentId}.${slug}.description drifted from store/agents — the runtime gate will stop localizing it`,
      );
      strictEqual(entry.name, humanizeSkillName(slug));
    }
  });

  for (const [lang, bundle] of Object.entries(LOCALES) as Array<
    [string, { catalog: Catalog }]
  >) {
    it(`${lang}: every packaged skill has a non-empty translated name + description`, () => {
      for (const { agentId, slug } of skills) {
        const entry = bundle.catalog[agentId]?.[slug];
        ok(entry, `${lang} catalog.${agentId}.${slug} is missing`);
        ok(
          entry.name.trim().length > 0,
          `${lang} catalog.${agentId}.${slug}.name is empty`,
        );
        ok(
          entry.description.trim().length > 0,
          `${lang} catalog.${agentId}.${slug}.description is empty`,
        );
      }
    });
  }

  it("every store category has a label in all three locales", () => {
    const seen = new Set<string>();
    for (const agentId of readdirSync(STORE_AGENTS_DIR).sort()) {
      let slugs: string[];
      try {
        slugs = readdirSync(
          join(STORE_AGENTS_DIR, agentId, ".agents", "skills"),
        );
      } catch {
        continue;
      }
      for (const slug of slugs) {
        const md = readFileSync(
          join(
            STORE_AGENTS_DIR,
            agentId,
            ".agents",
            "skills",
            slug,
            "SKILL.md",
          ),
          "utf8",
        );
        const cat = md.match(/^category:\s*(.+?)\s*$/m)?.[1];
        if (cat) seen.add(cat);
      }
    }
    for (const [lang, bundle] of Object.entries(LOCALES) as Array<
      [string, { categories: Record<string, string> }]
    >) {
      for (const cat of seen) {
        ok(
          (bundle.categories[cat] ?? "").trim().length > 0,
          `${lang} categories.${JSON.stringify(cat)} is missing`,
        );
      }
    }
  });
});
