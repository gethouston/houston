import type {
  PortableExportOverrides,
  PortableSelection,
} from "@houston/protocol";
import { docKey } from "./layout";
import type { PortableContent, PortablePackage } from "./portable";
import { skillKey } from "./skills";
import { jsonDoc } from "./store";

/**
 * Pure edits on portable content: the install-time subset and the accepted
 * anonymize diffs applied at export-pack time.
 */

/**
 * Keep only the selected parts of an unpacked package — the install-time
 * subset (the importer unticked items in the wizard). Unknown ids are simply
 * absent from the result; the manifest rides along unchanged.
 */
export function filterPackage(
  pkg: PortablePackage,
  sel: PortableSelection,
): PortablePackage {
  const skillSlugs = new Set(sel.skillSlugs);
  const routineIds = new Set(sel.routineIds);
  const learningIds = new Set(sel.learningIds);
  return {
    manifest: pkg.manifest,
    ...(sel.includeClaudeMd && pkg.claudeMd !== undefined
      ? { claudeMd: pkg.claudeMd }
      : {}),
    skills: pkg.skills.filter((s) => skillSlugs.has(s.slug)),
    routines: pkg.routines.filter((r) => routineIds.has(r.id)),
    learnings: pkg.learnings.filter((l) => learningIds.has(l.id)),
  };
}

/** Root-relative form of a key built by the canonical `<root>/…` builders. */
const relativeKey = (key: string) => key.slice(1);

/**
 * Serialize portable content into the agent-create seed payload: CLAUDE.md
 * plus a flat `relativePath → contents` map in the exact on-disk layout
 * (`.agents/skills/<slug>/SKILL.md`, `.houston/<family>/<family>.json`).
 * This is what lets an import ride the ordinary create-agent pipeline —
 * including a hosted-cloud gateway, which persists the payload and seeds the
 * new agent's pod with it — instead of needing a dedicated install route.
 */
export function packageSeed(content: PortableContent): {
  claudeMd?: string;
  seeds: Record<string, string>;
} {
  const seeds: Record<string, string> = {};
  for (const s of content.skills) {
    seeds[relativeKey(skillKey("", s.slug))] = s.body;
  }
  if (content.routines.length) {
    seeds[relativeKey(docKey("", "routines"))] = jsonDoc(content.routines);
  }
  if (content.learnings.length) {
    seeds[relativeKey(docKey("", "learnings"))] = jsonDoc(content.learnings);
  }
  return {
    ...(content.claudeMd !== undefined ? { claudeMd: content.claudeMd } : {}),
    seeds,
  };
}

/**
 * Replace content bodies with the anonymize diffs the user accepted in the
 * export wizard. Absent overrides leave the original text; a routine
 * override only touches the fields it names.
 */
export function applyOverrides(
  content: PortableContent,
  ov: PortableExportOverrides | undefined,
): PortableContent {
  if (!ov) return content;
  return {
    ...(content.claudeMd !== undefined
      ? { claudeMd: ov.claudeMd ?? content.claudeMd }
      : {}),
    skills: content.skills.map((s) => {
      const body = ov.skillBodies?.[s.slug];
      return body !== undefined ? { ...s, body } : s;
    }),
    routines: content.routines.map((r) => {
      const f = ov.routineFields?.[r.id];
      if (!f) return r;
      return {
        ...r,
        name: f.name ?? r.name,
        description: f.description ?? r.description,
        prompt: f.prompt ?? r.prompt,
      };
    }),
    learnings: content.learnings.map((l) => {
      const text = ov.learningTexts?.[l.id];
      return text !== undefined ? { ...l, text } : l;
    }),
  };
}
