import type { SkillWorkflow, SkillWorkflowStep } from "@houston/protocol";
import {
  type StepHead,
  splitStepText,
  stripStepNumbering,
  withDetailLines,
} from "./skill-workflow-text";

export const HOUSTON_SKILL_SCHEMA_VERSION = 1;
export const HOUSTON_WORKFLOW_MARKER = "<!-- houston-workflow:v1 -->";

/** The workflow section ends at the next top-level heading. */
const SECTION_END = /^#{1,2}\s/;
/** A step of the ordered list: only at column 0 — an indented `1.` is a substep. */
const STEP_LINE = /^(\d+)[.)]\s+(\S.*)$/;
/** A subheading inside the section: a step title when the section has no list. */
const SUBHEADING = /^#{3,6}\s+(\S.*)$/;
const FENCE = /^\s*(```|~~~)/;

export function isHoustonSkillFrontmatter(
  fm: Record<string, unknown>,
): boolean {
  const meta = fm.x_houston;
  if (typeof meta !== "object" || meta === null) return false;
  const record = meta as Record<string, unknown>;
  return (
    record.created_by === "houston" &&
    record.skill_schema === HOUSTON_SKILL_SCHEMA_VERSION
  );
}

/**
 * Reads the numbered procedure out of a Houston-authored SKILL.md so the app
 * can show it as steps instead of raw markdown. Only the section the agent
 * marked with {@link HOUSTON_WORKFLOW_MARKER} is read, up to the next top-level
 * heading; fenced code blocks are dropped (they are templates the agent fills,
 * not instructions the user reads). Two authored shapes are supported: the
 * ordered list (the common one) and, when the section carries no list, one
 * step per `###` subheading.
 */
export function parseHoustonSkillWorkflow(body: string): SkillWorkflow | null {
  const lines = workflowSectionLines(body);
  if (lines === null) return null;
  const steps = listSteps(lines);
  const resolved = steps.length > 0 ? steps : headingSteps(lines);
  return resolved.length > 0 ? { version: 1, steps: resolved } : null;
}

/** The marked section's lines, fenced blocks removed. */
function workflowSectionLines(body: string): string[] | null {
  const markerIndex = body.indexOf(HOUSTON_WORKFLOW_MARKER);
  if (markerIndex < 0) return null;
  const after = body.slice(markerIndex + HOUSTON_WORKFLOW_MARKER.length);
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of after.split(/\r?\n/)) {
    const fenceMatch = line.match(FENCE);
    if (fenceMatch?.[1]) {
      // A heading inside a fence is sample content, never the section's end.
      if (fence === null) fence = fenceMatch[1];
      else if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (SECTION_END.test(line)) break;
    lines.push(line);
  }
  return lines;
}

/** Steps from the ordered list; subheadings are group labels, not steps. */
function listSteps(lines: string[]): SkillWorkflowStep[] {
  const steps: SkillWorkflowStep[] = [];
  let active: StepHead | null = null;
  let detail: string[] = [];
  for (const line of lines) {
    const match = line.match(STEP_LINE);
    const next = match?.[2] ? splitStepText(match[2]) : null;
    if (next) {
      if (active) steps.push(withDetailLines(active, detail));
      active = next;
      detail = [];
      continue;
    }
    if (active && line.trim() && !SUBHEADING.test(line)) detail.push(line);
  }
  if (active) steps.push(withDetailLines(active, detail));
  return steps;
}

/** One step per subheading, for sections written as `### Step 1: ...` blocks.
 *  A heading carries no connected-app tag: only a bold title does. */
function headingSteps(lines: string[]): SkillWorkflowStep[] {
  const steps: SkillWorkflowStep[] = [];
  let title: string | null = null;
  let detail: string[] = [];
  for (const line of lines) {
    const heading = line.match(SUBHEADING);
    if (heading?.[1]) {
      if (title)
        steps.push(
          withDetailLines({ title, detail: null, integration: null }, detail),
        );
      title = stripStepNumbering(heading[1]);
      detail = [];
      continue;
    }
    if (title && line.trim()) detail.push(line);
  }
  if (title)
    steps.push(
      withDetailLines({ title, detail: null, integration: null }, detail),
    );
  return steps.filter((step) => step.title.length > 0);
}
