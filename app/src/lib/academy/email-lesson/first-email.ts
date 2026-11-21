import type { AcademyRecord } from "../academy-record.ts";

export function firstEmailCounts(
  progress: { record: AcademyRecord | null; isError: boolean },
  lessonId: string,
): boolean {
  if (progress.isError) return false;
  return progress.record?.lessons[lessonId] === undefined;
}
