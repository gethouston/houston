import type {
  SkillStepIntegration,
  SkillWorkflowStep,
} from "@houston/protocol";
import { takeIntegrationTag } from "./skill-workflow-tag";

/**
 * Turning one authored markdown list item into a readable step (title +
 * detail). The bodies are hand-written by agents and by the bundled catalog,
 * so the shapes vary: `1. **Title.** Detail`, `1. **Title** - detail`,
 * `1. Title: detail`, or a bare sentence. The rules below are deliberately
 * conservative — a hyphen or colon INSIDE a word, a path, or a time only ever
 * belongs to the text, never to a title/detail boundary.
 */

/** Titles longer than this get their tail moved into the detail. */
const TITLE_MAX = 80;
const TITLE_MIN = 2;

/** A spaced dash or a colon: the only separators that mean "title ends here". */
const SEPARATOR = /\s+[-–—]\s+|:\s+/;
/** The same characters left dangling at the head of a detail. */
const LEADING_SEPARATOR = /^[-–—:,;]+\s*/;
/** Sentence end that can serve as a title boundary. */
const SENTENCE_END = /[.!?](?=\s)/;
/** Clause boundaries, in the order we prefer to cut a too-long title. */
const CLAUSE_BOUNDARIES = [", ", "; ", " (", " [", " - ", " – ", " — "];

/** Inline markdown that carries no meaning in a plain-text step. */
const clean = (text: string): string =>
  text
    .replace(/`/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

/** A title also drops its markdown leftovers and trailing punctuation. */
const cleanTitle = (text: string): string =>
  clean(text)
    .replace(/^[*#\s]+|[*\s]+$/g, "")
    .replace(/[.,;:]+$/, "")
    .trim();

/**
 * A detail line keeps its own line break (the panel renders pre-line) and
 * trades its markdown bullet marker for a typographic one, so a nested list
 * reads as a list instead of as a dangling dash.
 */
const cleanDetailLine = (line: string): string =>
  clean(line).replace(/^[-*+]\s+/, "• ");

/** A step before its continuation lines join: what one authored line says. */
export interface StepHead {
  title: string;
  detail: string | null;
  integration: SkillStepIntegration | null;
}

/**
 * Splits one step's text into its title, the connected-app tag that may follow
 * it, and the detail after that. Returns null when nothing usable survives
 * (the caller then treats the line as detail of the step above it).
 */
export function splitStepText(text: string): StepHead | null {
  const { head, rest: afterHead, bold } = splitHead(text.trim());
  // Only a bold title can carry a tag; brackets anywhere else are prose.
  const tagged = bold
    ? takeIntegrationTag(afterHead)
    : { rest: afterHead, integration: null };
  const rest = tagged.rest;
  let title = cleanTitle(head);
  let detail = clean(rest).replace(LEADING_SEPARATOR, "");
  if (title.length > TITLE_MAX) {
    const shortened = shortenTitle(title);
    title = shortened.title;
    detail = detail
      ? `${shortened.overflow} ${detail}`.trim()
      : shortened.overflow;
  }
  if (title.length < TITLE_MIN) return null;
  return { title, detail: detail || null, integration: tagged.integration };
}

/** Appends continuation lines to a step's detail. */
export function withDetailLines(
  step: StepHead,
  lines: string[],
): SkillWorkflowStep {
  const extra = lines.map(cleanDetailLine).filter(Boolean);
  const detail = [step.detail, ...extra].filter(Boolean).join("\n");
  return {
    title: step.title,
    detail: detail || null,
    integration: step.integration,
  };
}

/**
 * A heading used as a step title ("Step 3 - Reconcile", "Paso 2: Revisar")
 * drops its own numbering: the panel numbers the steps itself, so keeping it
 * would render "3." twice.
 */
export const stripStepNumbering = (heading: string): string =>
  cleanTitle(heading.replace(/^\S{1,15}\s+[\d+]+[a-z]?\s*[-–—:]\s*/i, ""));

/** A bold lead is the title; otherwise only a SPACED separator may split. */
function splitHead(text: string): {
  head: string;
  rest: string;
  bold: boolean;
} {
  const bold = text.match(/^\*\*([^*]+?)\*\*(.*)$/);
  if (bold?.[1]) return { head: bold[1], rest: bold[2] ?? "", bold: true };
  const separator = text.match(SEPARATOR);
  if (separator?.index !== undefined && separator.index >= TITLE_MIN) {
    return {
      head: text.slice(0, separator.index),
      rest: text.slice(separator.index + separator[0].length),
      bold: false,
    };
  }
  return { head: text, rest: "", bold: false };
}

/** Moves a long title's tail into the detail, cutting at the latest clause
 *  boundary that still fits — never mid-word. */
function shortenTitle(title: string): { title: string; overflow: string } {
  const sentence = title.slice(0, TITLE_MAX + 2).search(SENTENCE_END);
  if (sentence >= TITLE_MIN) return cutAt(title, sentence + 1, sentence + 1);
  let best = -1;
  let skip = 0;
  for (const boundary of CLAUSE_BOUNDARIES) {
    const at = title.lastIndexOf(boundary, TITLE_MAX);
    if (at > best && at >= TITLE_MIN) {
      best = at;
      skip =
        boundary.startsWith(" (") || boundary.startsWith(" [")
          ? 1
          : boundary.length;
    }
  }
  if (best < 0) {
    best = title.lastIndexOf(" ", TITLE_MAX);
    skip = 1;
  }
  if (best < TITLE_MIN)
    return {
      title: title.slice(0, TITLE_MAX),
      overflow: title.slice(TITLE_MAX),
    };
  return cutAt(title, best, best + skip);
}

function cutAt(title: string, end: number, from: number) {
  return {
    title: cleanTitle(title.slice(0, end)),
    overflow: title.slice(from).trim(),
  };
}
