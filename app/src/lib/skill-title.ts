const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const titleLine = (title: string) => `title: ${JSON.stringify(title)}`;

export function withSkillTitle(content: string, title: string): string {
  const line = titleLine(title.trim());
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return `---\n${line}\n---\n\n${content}`;

  const lines = match[1].split(/\r?\n/);
  const at = lines.findIndex((l) => /^title\s*:/.test(l));
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && /^[ \t]/.test(lines[end])) end += 1;
    lines.splice(at, end - at, line);
  } else {
    const nameAt = lines.findIndex((l) => /^name\s*:/.test(l));
    lines.splice(nameAt >= 0 ? nameAt + 1 : lines.length, 0, line);
  }
  return `---\n${lines.join("\n")}\n---\n${content.slice(match[0].length)}`;
}
