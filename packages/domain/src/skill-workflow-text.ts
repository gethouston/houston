import type {
  SkillStepIntegration,
  SkillWorkflowStep,
} from "@houston/protocol";
import { takeIntegrationTag } from "./skill-workflow-tag";

const TITLE_MAX = 80;
const TITLE_MIN = 2;

const SEPARATOR = /(?<!\s)\s+[-–—]\s+|:\s+/;
const LEADING_SEPARATOR = /^[-–—:,;]+\s*/;
const SENTENCE_END = /[.!?](?=\s)/;
const CLAUSE_BOUNDARIES = [", ", "; ", " (", " [", " - ", " – ", " — "];

const clean = (text: string): string =>
  text
    .replace(/`/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const cleanTitle = (text: string): string =>
  clean(text)
    .replace(/^[*#\s]+|(?<![*\s])[*\s]+$/g, "")
    .replace(/(?<![.,;:])[.,;:]+$/, "")
    .trim();

const cleanDetailLine = (line: string): string =>
  clean(line).replace(/^[-*+]\s+/, "• ");

export interface StepHead {
  title: string;
  detail: string | null;
  integration: SkillStepIntegration | null;
}

export function splitStepText(text: string): StepHead | null {
  const { head, rest: afterHead, bold } = splitHead(text.trim());
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

export const stripStepNumbering = (heading: string): string =>
  cleanTitle(heading.replace(/^\S{1,15}\s+[\d+]+[a-z]?\s*[-–—:]\s*/i, ""));

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
