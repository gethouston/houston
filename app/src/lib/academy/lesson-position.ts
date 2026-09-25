// Where a started lesson stands, so leaving one is a pause rather than a loss.
//
// A position is the 0-based beat a lesson resumes on. It lives in the synced
// Academy record (`lessonPositions`) beside the finished lessons, and only for
// a lesson that is started and NOT finished: finishing clears it in the same
// write that pays (`completeLessonRecord`), and a replay of a finished lesson
// always starts from its first beat.
//
// Pure module: the rules here are what the record parser, the merge, the
// mutation and the path all read, so none of them states its own.

import { academyLesson } from "../../components/academy/lessons/registry.ts";
import { type AcademyRecord, createAcademyRecord } from "./academy-record.ts";
import { type LessonSpec, lessonResumeOn } from "./lesson-spec.ts";

export type LessonPositions = Partial<Record<string, number>>;

/** A beat index: a whole, non-negative number. */
export function isLessonPosition(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * The stored positions, read TOLERANTLY. Unlike an award, a position is
 * disposable: a bad one costs the user one "Continue" (they start the lesson
 * over), while refusing the whole record over it would cost them their rank.
 * So an unreadable entry is dropped on its own and the record still parses.
 */
export function parseLessonPositions(value: unknown): LessonPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const positions: LessonPositions = {};
  for (const [id, index] of Object.entries(value)) {
    if (id.trim() && isLessonPosition(index)) positions[id] = index;
  }
  return positions;
}

/**
 * Whether `index` names a beat the shipped lesson still has. A lesson this
 * build does not ship (a newer build's, or a retired one) is taken on trust:
 * this build cannot know its length, and a position is disposable anyway.
 */
function withinLesson(lessonId: string, index: number): boolean {
  const lesson = academyLesson(lessonId);
  return lesson === undefined || index < lesson.steps.length;
}

/**
 * Two copies' positions, folded. A run only moves forward, so the further beat
 * is the truer one; a lesson either copy finished has no position at all, so
 * a device that paused mid-lesson cannot bring back a "Continue" for a lesson
 * another device completed. A position past the end of the lesson (kept by a
 * longer version of it) is dropped: the further beat would otherwise bury the
 * place every fresh run of the lesson keeps, forever.
 */
export function mergeLessonPositions(
  a: LessonPositions,
  b: LessonPositions,
  finished: AcademyRecord["lessons"],
): LessonPositions {
  const merged: LessonPositions = {};
  for (const source of [a, b]) {
    for (const [id, index] of Object.entries(source)) {
      if (index === undefined || finished[id] || !withinLesson(id, index))
        continue;
      merged[id] = Math.max(merged[id] ?? 0, index);
    }
  }
  return merged;
}

/**
 * Notes the beat a run just reached. The SAME record comes back (so nothing is
 * written) when the lesson is already finished, which is what keeps a replay
 * from ever turning a finished lesson back into a "Continue", and when the
 * position is already the one stored.
 */
export function recordLessonPosition(
  record: AcademyRecord | null,
  lessonId: string,
  index: number,
  now: Date,
): AcademyRecord | null {
  if (!lessonId.trim()) throw new RangeError("academy id must not be empty");
  if (!isLessonPosition(index) || !withinLesson(lessonId, index))
    throw new RangeError("lesson position must be a beat of the lesson");
  if (record?.lessons[lessonId]) return record;
  if (record?.lessonPositions[lessonId] === index) return record;
  const base = record ?? createAcademyRecord(now);
  return {
    ...base,
    lessonPositions: { ...base.lessonPositions, [lessonId]: index },
    updatedAt: now.toISOString(),
  };
}

/**
 * The beat a lesson opens on. Finished or never started opens on the first
 * beat; a stored position resumes there, or on the earlier beat it names as
 * its `resumeOn`. A position past the lesson's end (the lesson lost beats
 * since it was paused) opens on the first beat too: resuming on a beat that no
 * longer exists would resume nowhere.
 */
export function lessonStartIndex(
  record: AcademyRecord | null,
  lesson: LessonSpec,
): number {
  if (!record || record.lessons[lesson.id]) return 0;
  const stored = record.lessonPositions[lesson.id];
  if (stored === undefined || stored >= lesson.steps.length) return 0;
  const resumeOn = lessonResumeOn(lesson.steps[stored]);
  if (resumeOn === undefined) return stored;
  const earlier = lesson.steps.findIndex((beat) => beat.id === resumeOn);
  return earlier >= 0 && earlier < stored ? earlier : stored;
}
