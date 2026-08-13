import type { TFunction } from "i18next";
import {
  type LessonCopyField,
  lessonCopyKey,
  lessonStepCopyKey,
} from "../../../lib/academy/lesson-spec.ts";

/**
 * Reading a lesson's words out of the `academy` namespace.
 *
 * A lesson addresses its copy by a key BUILT at runtime from the lesson and
 * step ids (`lesson-spec.ts` documents the convention), which the compile-time
 * key union cannot express — so the one loosening cast in the whole lesson
 * engine lives here, in a single named function. What replaces the compiler is
 * stronger for this shape anyway: `academy-lesson-registry.test.ts` walks every
 * shipped lesson and asserts each key it will resolve exists in
 * `locales/en/academy.json`, so a missing key fails the suite instead of
 * rendering a raw key at a user.
 */

/** i18next's own signature, minus the key union this module cannot satisfy. */
type LooseTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function resolve(t: TFunction<"academy">, key: string): string | undefined {
  const value = (t as unknown as LooseTranslator)(key, { defaultValue: "" });
  return value === "" ? undefined : value;
}

/** One field of one beat, or undefined when the lesson does not use it. */
export function lessonStepText(
  t: TFunction<"academy">,
  lessonId: string,
  stepId: string,
  field: LessonCopyField,
): string | undefined {
  return resolve(t, lessonStepCopyKey(lessonId, stepId, field));
}

/** The lesson's own name / line, as the path shows it. */
export function lessonText(
  t: TFunction<"academy">,
  lessonId: string,
  field: "title" | "description",
): string {
  return resolve(t, lessonCopyKey(lessonId, field)) ?? "";
}
