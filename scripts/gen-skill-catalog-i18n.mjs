#!/usr/bin/env node
/**
 * Regenerate the English `catalog` + `categories` subtrees of
 * `app/src/locales/en/skills.json` from the bundled store agents'
 * packaged skills (`store/agents/<id>/.agents/skills/<slug>/SKILL.md`).
 *
 * English is the reference the runtime edit-gate compares against
 * (`app/src/lib/localize-skill-copy.ts`): a skill whose on-disk description
 * no longer matches its packaged English copy is shown verbatim instead of
 * localized. Em dashes are normalized to hyphens because the locale
 * validator bans U+2014 in every locale file; the runtime gate applies the
 * same normalization before comparing.
 *
 * es/pt translations are authored by hand in the same key shapes
 * (`catalog.<agentId>.<slug>.{name,description}`, `categories.<name>`);
 * `app/tests/skill-catalog-locales.test.ts` fails when they drift from the
 * store content, and `pnpm check-locales` enforces cross-locale parity.
 *
 * Usage: node scripts/gen-skill-catalog-i18n.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE_AGENTS = join(ROOT, "store", "agents");
const EN_SKILLS = join(ROOT, "app", "src", "locales", "en", "skills.json");

/** Mirror of `app/src/lib/humanize-skill-name.ts`. */
function humanizeSkillName(slug) {
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Mirror of `normalizeSkillCopy` in `app/src/lib/localize-skill-copy.ts`. */
function normalizeSkillCopy(text) {
  return text.replace(/—/g, "-");
}

function frontmatter(skillMdPath) {
  const raw = readFileSync(skillMdPath, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No frontmatter in ${skillMdPath}`);
  return parseYaml(match[1]);
}

const catalog = {};
const categories = {};

for (const agentId of readdirSync(STORE_AGENTS).sort()) {
  const skillsDir = join(STORE_AGENTS, agentId, ".agents", "skills");
  let slugs;
  try {
    slugs = readdirSync(skillsDir).sort();
  } catch {
    continue; // store agent without packaged skills
  }
  const entries = {};
  for (const slug of slugs) {
    const fm = frontmatter(join(skillsDir, slug, "SKILL.md"));
    entries[slug] = {
      name: humanizeSkillName(slug),
      description: normalizeSkillCopy(String(fm.description ?? "")),
    };
    const category = typeof fm.category === "string" ? fm.category.trim() : "";
    if (category) categories[category] = category;
  }
  if (Object.keys(entries).length > 0) catalog[agentId] = entries;
}

const en = JSON.parse(readFileSync(EN_SKILLS, "utf8"));
en.categories = Object.fromEntries(
  Object.entries(categories).sort(([a], [b]) => a.localeCompare(b)),
);
en.catalog = catalog;
writeFileSync(EN_SKILLS, `${JSON.stringify(en, null, 2)}\n`);

const skillCount = Object.values(catalog).reduce(
  (n, entries) => n + Object.keys(entries).length,
  0,
);
console.log(
  `en/skills.json: ${skillCount} skills across ${Object.keys(catalog).length} store agents, ${Object.keys(categories).length} categories`,
);
