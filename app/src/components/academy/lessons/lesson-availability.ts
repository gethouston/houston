import type { Capabilities } from "@houston/engine-adapter";
import type {
  LessonRequirement,
  LessonSpec,
} from "../../../lib/academy/lesson-spec.ts";
import { INTEGRATION_PROVIDER } from "../../integrations/model.ts";

/**
 * Which lessons this deployment can teach. A lesson whose requirement is
 * missing is not offered at all: its beats would wait on something the user
 * cannot do here. Pure, so the rule is tested without React
 * (`app/tests/academy-lesson-availability.test.ts`).
 */

export type LessonCapabilities = Pick<Capabilities, "integrations"> | null;

function requirementMet(
  requirement: LessonRequirement,
  capabilities: LessonCapabilities,
): boolean {
  switch (requirement) {
    case "integrations":
      return capabilities?.integrations.includes(INTEGRATION_PROVIDER) ?? false;
  }
}

export function lessonAvailable(
  lesson: LessonSpec,
  capabilities: LessonCapabilities,
): boolean {
  return (lesson.requires ?? []).every((requirement) =>
    requirementMet(requirement, capabilities),
  );
}

/** The lessons that can be taught here, in the order given. */
export function availableLessons(
  lessons: readonly LessonSpec[],
  capabilities: LessonCapabilities,
): LessonSpec[] {
  return lessons.filter((lesson) => lessonAvailable(lesson, capabilities));
}
