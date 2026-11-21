import type { AcademyChapterId } from "./academy-chapters.ts";
import type { LessonSignalSpec } from "./lesson-signals.ts";

export const LESSON_PANEL_IDS = ["emailConnect", "emailSender"] as const;

export type LessonPanelId = (typeof LESSON_PANEL_IDS)[number];

export const LESSON_COMPANION_IDS = ["emailAsk", "emailWatch"] as const;

export type LessonCompanionId = (typeof LESSON_COMPANION_IDS)[number];

type ResumeOn = { resumeOn?: string };

export type LessonStepSpec =
  | { kind: "video"; id: string; videoId: string }
  | { kind: "card"; id: string }
  | ({
      kind: "spotlight";
      id: string;
      target: string;
      advanceOn: LessonSignalSpec;
      navigate?: { viewId: string };
      inDialog?: boolean;
      companion?: LessonCompanionId;
    } & ResumeOn)
  | ({
      kind: "panel";
      id: string;
      panel: LessonPanelId;
      advanceOn?: LessonSignalSpec;
    } & ResumeOn);

export function lessonResumeOn(step: LessonStepSpec): string | undefined {
  return step.kind === "spotlight" || step.kind === "panel"
    ? step.resumeOn
    : undefined;
}

export type LessonRequirement = "integrations";

export interface LessonSpec {
  id: string;
  chapterId: AcademyChapterId;
  requires?: readonly LessonRequirement[];
  experience: number;
  steps: LessonStepSpec[];
}

export type LessonCopyField = "title" | "body" | "cta";

export function lessonStepCopyKey(
  lessonId: string,
  stepId: string,
  field: LessonCopyField,
): string {
  return `lessons.${lessonId}.steps.${stepId}.${field}`;
}

export function lessonCopyKey(
  lessonId: string,
  field: "title" | "description",
): string {
  return `lessons.${lessonId}.${field}`;
}

export function lessonStepCopyFields(step: LessonStepSpec): {
  required: LessonCopyField[];
  optional: LessonCopyField[];
} {
  switch (step.kind) {
    case "video":
      return { required: ["title"], optional: ["body"] };
    case "card":
      return { required: ["title", "body", "cta"], optional: [] };
    case "spotlight":
      return step.advanceOn.type === "acknowledged"
        ? { required: ["body", "cta"], optional: [] }
        : { required: ["body"], optional: [] };
    case "panel":
      return { required: ["title", "body"], optional: ["cta"] };
  }
}

export type LessonBeatArrival = "open" | "advance";

export function lessonBeatView(
  spec: LessonSpec,
  index: number,
  arrival: LessonBeatArrival,
): string | null {
  const own = (step: LessonStepSpec | undefined) =>
    step?.kind === "spotlight" ? (step.navigate?.viewId ?? null) : null;
  if (arrival === "advance") return own(spec.steps[index]);
  for (let at = Math.min(index, spec.steps.length - 1); at >= 0; at--) {
    const view = own(spec.steps[at]);
    if (view !== null) return view;
  }
  return null;
}
