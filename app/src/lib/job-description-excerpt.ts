import {
  type ParsedJobDescription,
  parseJobDescription,
} from "@houston/sdk/job-description";

/**
 * An excerpt is capped upstream, so it can end INSIDE the frontmatter block,
 * with no closing fence for the grammar to find. Closing it is what makes the
 * facts it did carry readable — but only when the close actually yields facts;
 * otherwise the text is prose that merely opens with a rule, and the fence we
 * added is no part of it.
 */
function readExcerpt(excerpt: string): ParsedJobDescription {
  const direct = parseJobDescription(excerpt);
  if (direct.fields.industry || direct.fields.role) return direct;
  if (!excerpt.startsWith("---")) return direct;
  const closed = parseJobDescription(`${excerpt}\n---\n`);
  return closed.fields.industry || closed.fields.role ? closed : direct;
}

/**
 * What a job description reads as in a LIST ROW (the copy wizard's excerpt of
 * the file it would carry over): the free description when there is one, else
 * the facts the block holds. Never the fence lines themselves, which say
 * nothing to a person deciding whether to bring this agent's instructions.
 *
 * A text that yields neither facts nor a description is shown as it arrived
 * rather than blanked.
 */
export function jobDescriptionExcerpt(excerpt: string): string {
  const read = readExcerpt(excerpt);
  if (read.body) return read.body;
  const facts = [read.fields.industry, read.fields.role].filter(
    (fact): fact is string => !!fact,
  );
  return facts.length > 0 ? facts.join(" · ") : excerpt;
}
