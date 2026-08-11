/**
 * Rewrite a SKILL.md's frontmatter `title:` — the display phrase every surface
 * renders via `skillDisplayTitle` (PRODUCT-1018's header rename). The
 * directory slug (the skill's one canonical identity) is deliberately left
 * alone: a title can drift freely while loading keeps resolving by slug.
 */

/** Opening frontmatter fence + block + closing fence (with its newline). */
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** YAML double-quoted scalars accept JSON escaping, so this is always safe. */
const titleLine = (title: string) => `title: ${JSON.stringify(title)}`;

export function withSkillTitle(content: string, title: string): string {
  const line = titleLine(title.trim());
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return `---\n${line}\n---\n\n${content}`;

  const lines = match[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^title\s*:/.test(l));
  if (at >= 0) {
    // Swallow a block-scalar value's indented continuation lines so a
    // multi-line title collapses to the one new line instead of orphaning.
    let end = at + 1;
    while (end < lines.length && /^[ \t]/.test(lines[end])) end += 1;
    lines.splice(at, end - at, line);
  } else {
    const nameAt = lines.findIndex((l) => /^name\s*:/.test(l));
    lines.splice(nameAt >= 0 ? nameAt + 1 : lines.length, 0, line);
  }
  return `---\n${lines.join("\n")}\n---\n${content.slice(match[0].length)}`;
}
