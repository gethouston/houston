import type { PortableSelection } from "@houston/protocol";
import { docKey } from "./layout";
import type { PortableContent, PortablePackage } from "./portable";
import { skillKey } from "./skills";
import { jsonDoc } from "./store";

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

const relativeKey = (key: string) => key.slice(1);

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
