const FM_BLOCK = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

/** The SKILL.md markdown body with the frontmatter block stripped — what
 *  skill previews show as the step-by-step instructions. */
export function skillBodyOf(content: string): string {
  return content.replace(FM_BLOCK, "").trim();
}
