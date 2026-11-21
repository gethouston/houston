import {
  type ParsedJobDescription,
  parseJobDescription,
} from "@houston/sdk/job-description";

function readExcerpt(excerpt: string): ParsedJobDescription {
  const direct = parseJobDescription(excerpt);
  if (direct.fields.industry || direct.fields.role) return direct;
  if (!excerpt.startsWith("---")) return direct;
  const closed = parseJobDescription(`${excerpt}\n---\n`);
  return closed.fields.industry || closed.fields.role ? closed : direct;
}

export function jobDescriptionExcerpt(excerpt: string): string {
  const read = readExcerpt(excerpt);
  if (read.body) return read.body;
  const facts = [read.fields.industry, read.fields.role].filter(
    (fact): fact is string => !!fact,
  );
  return facts.length > 0 ? facts.join(" · ") : excerpt;
}
