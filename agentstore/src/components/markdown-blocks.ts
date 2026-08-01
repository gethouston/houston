export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "list"; ordered: boolean; items: string[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^(?:---|\*\*\*|___)\s*$/;
const UL = /^[-*+]\s+(.*)$/;
const OL = /^\d+[.)]\s+(.*)$/;

export function parseMarkdownBlocks(src: string): MarkdownBlock[] {
  const lines = src.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]?.length ?? 1,
        text: (heading[2] ?? "").trim(),
      });
      i += 1;
      continue;
    }
    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        body.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: body.join("\n").trim() });
      continue;
    }
    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const pattern = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").match(pattern)?.[1]?.trim() ?? "");
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() !== "" &&
      !(lines[i] ?? "").startsWith("```") &&
      !(lines[i] ?? "").startsWith(">") &&
      !HEADING.test(lines[i] ?? "") &&
      !HR.test(lines[i] ?? "") &&
      !UL.test(lines[i] ?? "") &&
      !OL.test(lines[i] ?? "")
    ) {
      paragraph.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n").trim() });
  }
  return blocks;
}
