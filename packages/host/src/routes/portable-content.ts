import {
  loadLearnings,
  loadRoutines,
  loadSkillDetail,
  type PortableContent,
} from "@houston/domain";
import type { PortableSelection } from "@houston/protocol";
import type { Vfs } from "../vfs";

/**
 * Gather an agent's selected shareable content off the vfs — the common
 * read behind portable export and anonymize. The selection is untrusted
 * wizard input, so every read stays defensive (optional chaining, unknown
 * ids simply don't match).
 */
export async function gatherPortableContent(
  vfs: Vfs,
  root: string,
  sel: PortableSelection,
): Promise<PortableContent> {
  const content: PortableContent = { skills: [], routines: [], learnings: [] };
  if (sel.includeClaudeMd) {
    const md = await vfs.readText(`${root}/CLAUDE.md`);
    if (md !== null) content.claudeMd = md;
  }
  if (sel.skillSlugs?.length) {
    for (const slug of sel.skillSlugs) {
      const detail = await loadSkillDetail(vfs, root, slug);
      if (detail) content.skills.push({ slug, body: detail.content });
    }
  }
  if (sel.routineIds?.length) {
    const { items } = await loadRoutines(vfs, root);
    content.routines = items.filter((r) => sel.routineIds.includes(r.id));
  }
  if (sel.learningIds?.length) {
    const { items } = await loadLearnings(vfs, root);
    content.learnings = items.filter((l) => sel.learningIds.includes(l.id));
  }
  return content;
}
