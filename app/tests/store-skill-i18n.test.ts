import { ok, strictEqual } from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Pins the translated store-skill trees (store/agents-i18n/<lang>/<id>/) to
// the English source (store/agents/<id>/) via the slug/title map
// (store/skills-i18n.json). A store skill that is added, renamed, or
// re-described fails here until its es/pt translations exist and the
// template payloads are regenerated (`node scripts/gen-agent-templates.mjs`).
//
// Frontmatter is field-extracted by regex, not a YAML parser: the `yaml`
// package isn't resolvable from app tests, and these files are generated
// under our own conventions (single-line quoted scalars).

const ROOT = join(import.meta.dirname, "..", "..");
const STORE = join(ROOT, "store", "agents");
const STORE_I18N = join(ROOT, "store", "agents-i18n");
const LANGS = ["es", "pt"] as const;

interface LangEntry {
  slug: string;
  title: string;
}
interface SlugMap {
  categories: Record<string, Record<string, string>>;
  skills: Record<string, Record<string, Record<string, LangEntry>>>;
}
const slugMap = JSON.parse(
  readFileSync(join(ROOT, "store", "skills-i18n.json"), "utf8"),
) as SlugMap;

const fmField = (raw: string, field: string): string | null => {
  const m = raw.match(
    new RegExp(`^${field}: (?:"((?:[^"\\\\]|\\\\.)*)"|(.+))$`, "m"),
  );
  if (!m) return null;
  return m[1] !== undefined ? (JSON.parse(`"${m[1]}"`) as string) : m[2].trim();
};

const listSkills = (dir: string): string[] => {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
};

describe("translated store skill trees stay in sync with store/agents", () => {
  const storeIds = readdirSync(STORE)
    .filter((id) => listSkills(join(STORE, id, ".agents", "skills")).length > 0)
    .sort();

  it("covers every store agent in the slug map", () => {
    ok(storeIds.length > 0);
    for (const id of storeIds) ok(slugMap.skills[id], `slug map misses ${id}`);
  });

  for (const lang of LANGS) {
    it(`${lang}: every packaged skill has a valid translated file`, () => {
      for (const id of storeIds) {
        const enSlugs = listSkills(join(STORE, id, ".agents", "skills"));
        const langDir = join(STORE_I18N, lang, id, ".agents", "skills");
        const seen = new Set<string>();
        for (const enSlug of enSlugs) {
          const entry = slugMap.skills[id]?.[enSlug]?.[lang];
          ok(entry, `${lang} slug map misses ${id}/${enSlug}`);
          ok(
            /^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug),
            `${id}/${enSlug} ${lang} slug not ASCII kebab: ${entry.slug}`,
          );
          seen.add(entry.slug);
          const dest = join(langDir, entry.slug, "SKILL.md");
          ok(existsSync(dest), `missing ${dest}`);
          const raw = readFileSync(dest, "utf8");
          const src = readFileSync(
            join(STORE, id, ".agents", "skills", enSlug, "SKILL.md"),
            "utf8",
          );
          strictEqual(fmField(raw, "name"), entry.slug, `${dest}: name`);
          strictEqual(fmField(raw, "title"), entry.title, `${dest}: title`);
          ok(
            (fmField(raw, "description") ?? "").length > 0,
            `${dest}: description`,
          );
          const category = fmField(src, "category");
          if (category) {
            strictEqual(
              fmField(raw, "category"),
              slugMap.categories[lang][category],
              `${dest}: category should be the ${lang} translation of ${category}`,
            );
          }
          ok(!raw.includes("—"), `${dest}: contains em dash`);
          ok(
            raw.length >= src.length * 0.55,
            `${dest}: suspiciously short (${raw.length} vs ${src.length})`,
          );
        }
        for (const stray of listSkills(langDir)) {
          ok(seen.has(stray), `${lang}/${id}/${stray} has no English source`);
        }
      }
    });

    it(`${lang}: generated template payloads exist and carry the renames`, () => {
      for (const id of storeIds) {
        const payloadPath = join(
          ROOT,
          "app/src/agents/builtin/store-templates",
          `${id}.${lang}.json`,
        );
        ok(
          existsSync(payloadPath),
          `missing ${payloadPath} — regenerate templates`,
        );
        const payload = JSON.parse(readFileSync(payloadPath, "utf8")) as {
          seeds: Record<string, string>;
          skillRenames: Record<string, string>;
        };
        for (const [enSlug, entry] of Object.entries(
          slugMap.skills[id] ?? {},
        )) {
          strictEqual(payload.skillRenames[enSlug], entry[lang].slug);
          ok(
            payload.seeds[`.agents/skills/${entry[lang].slug}/SKILL.md`],
            `${id}.${lang}.json misses seed for ${entry[lang].slug}`,
          );
        }
        // Token rewrite left no English slug references behind anywhere.
        for (const [rel, content] of Object.entries(payload.seeds)) {
          for (const enSlug of Object.keys(payload.skillRenames)) {
            ok(
              !new RegExp(`(?<![a-z0-9-])${enSlug}(?![a-z0-9-])`).test(content),
              `${id}.${lang}.json ${rel} still references English slug ${enSlug}`,
            );
          }
        }
      }
    });
  }
});
