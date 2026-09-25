import type { AcademyRecord } from "../academy-record.ts";

/**
 * Whether a delivered email is the user's FIRST: only while the lesson is
 * unfinished. A replay sends a real email too, but it is not an activation.
 *
 * Takes the record as READ, not just the record: a null record read
 * successfully is a user who has earned nothing yet, but one that could not
 * be read says nothing, and counting it would count a replay twice.
 */
export function firstEmailCounts(
  progress: { record: AcademyRecord | null; isError: boolean },
  lessonId: string,
): boolean {
  if (progress.isError) return false;
  return progress.record?.lessons[lessonId] === undefined;
}
