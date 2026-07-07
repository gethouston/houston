#!/usr/bin/env node
// Generate the frontend's built-in agent "templates" from the canonical
// `store/agents/<id>/` content (the first-party agents formerly served by the
// cut store/marketplace). The TS engine has no store backend, so instead of a
// remote catalog we bake these agents into the New Agent picker and hand their
// files to the host via the existing `seeds` create contract.
//
// Outputs (regenerate with `node scripts/gen-agent-templates.mjs`):
//   app/src/agents/builtin/store-catalog.ts        — light AgentConfig cards
//   app/src/agents/builtin/store-templates/<id>.json — { claudeMd, seeds }
//   app/src/agents/builtin/store-templates/<id>.<lang>.json — the es/pt
//     variant: same payload with the `.agents/skills/*` seeds swapped for the
//     translated tree (`store/agents-i18n/<lang>/<id>/`), every English skill
//     slug token rewritten to its translated slug (in skill bodies, CLAUDE.md,
//     data-schema.md, and manifest agentSeeds — cross-references must follow
//     the renamed directories), plus a `skillRenames` en→lang slug map the
//     app's locale migration uses to swap already-seeded agents.
//
// Slug/title source of truth: store/skills-i18n.json. Translated SKILL.md
// sources keep ENGLISH slug tokens in their bodies (translators preserve
// identifiers verbatim); this script is the single place tokens are renamed,
// so cross-references can never drift per-file.
//
// The JSON payloads are Biome-ignored (see biome.json) and lazily loaded per
// agent at create time; only the light catalog ships in the initial bundle.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORE = join(ROOT, "store/agents");
const STORE_I18N = join(ROOT, "store/agents-i18n");
const SLUG_MAP = join(ROOT, "store/skills-i18n.json");
const OUT_DIR = join(ROOT, "app/src/agents/builtin/store-templates");
const CATALOG_TS = join(ROOT, "app/src/agents/builtin/store-catalog.ts");
const LANGS = ["es", "pt"];

// Top-level files that are store/engine metadata, not agent content.
const EXCLUDE = new Set([
  "houston.json",
  "icon.png",
  ".migrations.json",
  ".gitignore",
  "CLAUDE.md", // carried separately as `claudeMd`
]);
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
]);

/** Recursively list every file under `dir` as absolute paths. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

/**
 * Rewrite every English skill-slug token to its translated slug. Tokens are
 * matched with kebab-boundaries so one slug can never bite a longer one
 * (longest-first ordering guards prefix pairs too).
 */
function rewriteSlugTokens(text, renames) {
  let out = text;
  const pairs = Object.entries(renames).sort(([a], [b]) => b.length - a.length);
  for (const [from, to] of pairs) {
    out = out.replace(
      new RegExp(`(?<![a-z0-9-])${from}(?![a-z0-9-])`, "g"),
      to,
    );
  }
  return out;
}

/** Light card fields lifted from houston.json (never the heavy seeds/claudeMd). */
const CARD_FIELDS = [
  "id",
  "name",
  "description",
  "version",
  "icon",
  "image",
  "color",
  "category",
  "author",
  "tags",
  "integrations",
];

if (!existsSync(STORE)) {
  console.error(`[gen-agent-templates] no store/agents at ${STORE}`);
  process.exit(1);
}

const slugMap = JSON.parse(readFileSync(SLUG_MAP, "utf8"));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ids = readdirSync(STORE)
  .filter((id) => statSync(join(STORE, id)).isDirectory())
  .sort();

const cards = [];

for (const id of ids) {
  const agentDir = join(STORE, id);
  const manifest = JSON.parse(
    readFileSync(join(agentDir, "houston.json"), "utf8"),
  );

  const claudePath = join(agentDir, "CLAUDE.md");
  const claudeMd = existsSync(claudePath)
    ? readFileSync(claudePath, "utf8")
    : undefined;

  // Seeds: every content file under the agent dir (skills, data-schema, etc.),
  // then overlay the manifest's declared agentSeeds (empty data files, seeded
  // routines) which live only in houston.json, not on disk.
  const seeds = {};
  for (const abs of walk(agentDir)) {
    const rel = relative(agentDir, abs).split("\\").join("/");
    if (EXCLUDE.has(rel)) continue;
    const dot = rel.lastIndexOf(".");
    if (dot >= 0 && BINARY_EXT.has(rel.slice(dot).toLowerCase())) continue;
    seeds[rel] = readFileSync(abs, "utf8");
  }
  Object.assign(seeds, manifest.agentSeeds ?? {});

  writeFileSync(
    join(OUT_DIR, `${id}.json`),
    JSON.stringify({ claudeMd, seeds }),
  );

  // Per-locale variants: swap the skills tree for the translated one and
  // rename every slug token so cross-references keep resolving.
  for (const lang of LANGS) {
    const skillsDir = join(STORE_I18N, lang, id, ".agents/skills");
    if (!existsSync(skillsDir)) {
      console.error(`[gen-agent-templates] MISSING ${lang} skills for ${id}`);
      process.exitCode = 1;
      continue;
    }
    const agentMap = slugMap.skills[id] ?? {};
    const skillRenames = {};
    for (const [enSlug, langs] of Object.entries(agentMap)) {
      skillRenames[enSlug] = langs[lang].slug;
    }

    const langSeeds = {};
    for (const [rel, content] of Object.entries(seeds)) {
      if (rel.startsWith(".agents/skills/")) continue; // replaced wholesale
      langSeeds[rel] = rewriteSlugTokens(content, skillRenames);
    }
    for (const abs of walk(skillsDir)) {
      const rel = `.agents/skills/${relative(skillsDir, abs).split("\\").join("/")}`;
      langSeeds[rel] = rewriteSlugTokens(
        readFileSync(abs, "utf8"),
        skillRenames,
      );
    }
    const langClaudeMd =
      claudeMd === undefined
        ? undefined
        : rewriteSlugTokens(claudeMd, skillRenames);
    writeFileSync(
      join(OUT_DIR, `${id}.${lang}.json`),
      JSON.stringify({
        claudeMd: langClaudeMd,
        seeds: langSeeds,
        skillRenames,
      }),
    );
  }

  const card = {};
  for (const f of CARD_FIELDS) {
    if (manifest[f] !== undefined) card[f] = manifest[f];
  }
  card.author = manifest.author ?? "Houston";
  cards.push(card);
}

// Light slug→store-agent index so the app's skill locale migration can spot
// candidates in a skills list without loading any heavy template payload.
const skillSources = {};
for (const id of ids) {
  for (const enSlug of Object.keys(slugMap.skills[id] ?? {})) {
    skillSources[enSlug] ??= [];
    skillSources[enSlug].push(id);
  }
}

const banner =
  "// GENERATED by scripts/gen-agent-templates.mjs — do not edit by hand.\n" +
  "// Source of truth: store/agents/<id>/houston.json. Regenerate after edits.\n";

writeFileSync(
  join(ROOT, "app/src/agents/builtin/store-skill-sources.ts"),
  `${banner}// English store-skill slug → the store agent id(s) that ship it. Drives\n` +
    "// candidate detection in the skill locale migration (store/skills-i18n.json\n" +
    "// is the slug/title source of truth).\n" +
    `export const STORE_SKILL_SOURCES: Record<string, readonly string[]> = ${JSON.stringify(skillSources, null, 2)};\n`,
);
const catalog =
  `${banner}import type { AgentConfig } from "../../lib/types";\n\n` +
  "// Light cards for the New Agent picker. The heavy CLAUDE.md + skills/data\n" +
  "// seeds live in ./store-templates/<id>.json, lazily loaded on create by\n" +
  "// ./store-template-loader.ts.\n" +
  `export const storeCatalogConfigs: AgentConfig[] = ${JSON.stringify(cards, null, 2)};\n\n` +
  "export const STORE_TEMPLATE_IDS: ReadonlySet<string> = new Set(\n" +
  "  storeCatalogConfigs.map((c) => c.id),\n" +
  ");\n";

writeFileSync(CATALOG_TS, catalog);

console.log(
  `[gen-agent-templates] wrote ${ids.length} templates: ${ids.join(", ")}`,
);
