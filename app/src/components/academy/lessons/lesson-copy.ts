import type { TFunction } from "i18next";
import {
  type LessonCopyField,
  lessonCopyKey,
  lessonStepCopyKey,
} from "../../../lib/academy/lesson-spec.ts";

type LooseTranslator = (
  key: string,
  options?: Record<string, unknown>,
) => string;

function resolve(t: TFunction<"academy">, key: string): string | undefined {
  const value = (t as unknown as LooseTranslator)(key, { defaultValue: "" });
  return value === "" ? undefined : value;
}

export function lessonStepText(
  t: TFunction<"academy">,
  lessonId: string,
  stepId: string,
  field: LessonCopyField,
): string | undefined {
  return resolve(t, lessonStepCopyKey(lessonId, stepId, field));
}

export function lessonText(
  t: TFunction<"academy">,
  lessonId: string,
  field: "title" | "description",
): string {
  return resolve(t, lessonCopyKey(lessonId, field)) ?? "";
}
