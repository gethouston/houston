import type { SkillWorkflow, SkillWorkflowStep } from "@houston/protocol";
import {
  type StepHead,
  splitStepText,
  stripStepNumbering,
  withDetailLines,
} from "./skill-workflow-text";

export const HOUSTON_SKILL_SCHEMA_VERSION = 1;
export const HOUSTON_WORKFLOW_MARKER = "<!-- houston-workflow:v1 -->";

const SECTION_END = /^#{1,2}\s/;
const STEP_LINE = /^(\d+)[.)]\s+(\S.*)$/;
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

export function parseHoustonSkillWorkflow(body: string): SkillWorkflow | null {
  const lines = workflowSectionLines(body);
  if (lines === null) return null;
  const steps = listSteps(lines);
  const resolved = steps.length > 0 ? steps : headingSteps(lines);
  return resolved.length > 0 ? { version: 1, steps: resolved } : null;
}

function workflowSectionLines(body: string): string[] | null {
  const markerIndex = body.indexOf(HOUSTON_WORKFLOW_MARKER);
  if (markerIndex < 0) return null;
  const after = body.slice(markerIndex + HOUSTON_WORKFLOW_MARKER.length);
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of after.split(/\r?\n/)) {
    const fenceMatch = line.match(FENCE);
    if (fenceMatch?.[1]) {
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
