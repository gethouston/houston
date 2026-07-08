import { STORE_SKILL_SOURCES } from "../agents/builtin/store-skill-sources";
import { loadStoreTemplate } from "../agents/builtin/store-template-loader";
import { tauriAgent, tauriSkills } from "./tauri";
import type { SkillSummary } from "./types";

/**
 * Swap an agent's unedited English store skills for their translated
 * versions when the workspace language is es/pt.
 *
 * Store skills are seeded once at agent creation; agents created before the
 * translated templates shipped (or while the workspace was English) carry
 * the English files. A skill is only swapped when its on-disk content is
 * byte-identical to the packaged English version — anything the user or the
 * agent has touched is their artifact and is never modified. The swap is a
 * rename (the translated slug is a new directory), so cross-references in
 * the agent's CLAUDE.md and data-schema.md are token-rewritten to follow —
 * for the renamed slugs only.
 *
 * Idempotent and resumable: a matched skill disappears from the list once
 * swapped; a non-matching (edited) one is remembered in localStorage so it
 * isn't re-fetched on every mount.
 */
/** One pass per agent+language at a time — panels can mount the same agent twice. */
const inFlight = new Set<string>();

export async function migrateStoreSkillsToLocale(
  agentPath: string,
  agentId: string,
  locale: string,
  skills: readonly SkillSummary[],
): Promise<number> {
  const lang = locale.toLowerCase().split("-")[0];
  if (!lang || lang === "en") return 0;
  const flightKey = `${agentPath}::${lang}`;
  if (inFlight.has(flightKey)) return 0;
  inFlight.add(flightKey);
  try {
    return await runMigration(agentPath, agentId, lang, skills);
  } finally {
    inFlight.delete(flightKey);
  }
}

async function runMigration(
  agentPath: string,
  agentId: string,
  lang: string,
  skills: readonly SkillSummary[],
): Promise<number> {
  const skipped = readSkipped(agentId, lang);
  const candidates = skills.filter(
    (s) => STORE_SKILL_SOURCES[s.name] && !skipped.has(s.name),
  );
  if (candidates.length === 0) return 0;

  const storeIds = [
    ...new Set(candidates.flatMap((s) => [...STORE_SKILL_SOURCES[s.name]])),
  ];
  const templates = await Promise.all(
    storeIds.map(async (id) => ({
      id,
      en: await loadStoreTemplate(id),
      localized: await loadStoreTemplate(id, lang),
    })),
  );

  const renames: Record<string, string> = {};
  const newlySkipped: string[] = [];
  for (const skill of candidates) {
    const detail = await tauriSkills.load(agentPath, skill.name);
    // The slug alone can be ambiguous (two store agents ship a couple of the
    // same slugs with different content) — the byte-exact content match picks
    // the right source, and doubles as the "unedited" gate.
    const match = templates.find(
      ({ en }) =>
        en.seeds[`.agents/skills/${skill.name}/SKILL.md`] === detail.content,
    );
    if (!match) {
      newlySkipped.push(skill.name);
      continue;
    }
    const langSlug = match.localized.skillRenames?.[skill.name];
    const langContent =
      langSlug && match.localized.seeds[`.agents/skills/${langSlug}/SKILL.md`];
    if (!langSlug || !langContent) {
      newlySkipped.push(skill.name);
      continue;
    }
    await tauriAgent.writeFile(
      agentPath,
      `.agents/skills/${langSlug}/SKILL.md`,
      langContent,
    );
    await tauriSkills.delete(agentPath, skill.name);
    renames[skill.name] = langSlug;
  }

  if (Object.keys(renames).length > 0) {
    for (const rel of ["CLAUDE.md", "data-schema.md"]) {
      const current = await tauriAgent.readFile(agentPath, rel);
      if (!current) continue;
      const rewritten = rewriteSkillSlugTokens(current, renames);
      if (rewritten !== current) {
        await tauriAgent.writeFile(agentPath, rel, rewritten);
      }
    }
  }
  if (newlySkipped.length > 0) {
    writeSkipped(agentId, lang, [...skipped, ...newlySkipped]);
  }
  return Object.keys(renames).length;
}

/**
 * Rewrite English skill-slug tokens to their renamed slugs, kebab-boundary
 * matched, longest slug first (mirror of `rewriteSlugTokens` in
 * `scripts/gen-agent-templates.mjs`).
 */
export function rewriteSkillSlugTokens(
  text: string,
  renames: Record<string, string>,
): string {
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

const skipKey = (agentId: string, lang: string) =>
  `houston.skillLocaleMigration.v1.${agentId}.${lang}`;

function readSkipped(agentId: string, lang: string): Set<string> {
  try {
    const raw = localStorage.getItem(skipKey(agentId, lang));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSkipped(agentId: string, lang: string, slugs: Iterable<string>) {
  try {
    localStorage.setItem(skipKey(agentId, lang), JSON.stringify([...slugs]));
  } catch {
    // localStorage unavailable: the pass just re-checks next mount.
  }
}
