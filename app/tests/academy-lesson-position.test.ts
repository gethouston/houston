import { deepStrictEqual, ok, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import {
  academyLesson,
  EMPLOYEE_EMAIL_LESSON_ID,
  HOUSTON_TOUR_LESSON_ID,
} from "../src/components/academy/lessons/registry.ts";
import { mergeAcademyRecords } from "../src/lib/academy/academy-merge.ts";
import { createAcademyMutationQueue } from "../src/lib/academy/academy-mutations.ts";
import {
  type AcademyRecord,
  completeLessonRecord,
  serializeAcademyRecord,
} from "../src/lib/academy/academy-record.ts";
import { parseAcademyRecord } from "../src/lib/academy/academy-record-parse.ts";
import { academyPortsFor } from "../src/lib/academy/academy-store.ts";
import {
  lessonStartIndex,
  recordLessonPosition,
} from "../src/lib/academy/lesson-position.ts";
import {
  type LessonSpec,
  lessonBeatView,
} from "../src/lib/academy/lesson-spec.ts";

// Leaving a lesson is a pause: the beat it was on is kept in the synced record
// and the next run opens there, until finishing clears it.

const NOW = new Date("2026-09-01T10:00:00.000Z");

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {},
  lessons: {},
  lessonPositions: {},
  usageByDevice: {},
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

const FINISHED = { completedAt: "2026-08-02T10:00:00.000Z", experience: 20 };

describe("a stored lesson position", () => {
  it("round-trips through the stored blob", () => {
    const value = record({ lessonPositions: { tour: 3 } });
    deepStrictEqual(parseAcademyRecord(serializeAcademyRecord(value)), value);
  });

  it("reads as none on a record written before positions existed", () => {
    const older = JSON.parse(serializeAcademyRecord(record()));
    delete older.lessonPositions;
    deepStrictEqual(
      parseAcademyRecord(JSON.stringify(older))?.lessonPositions,
      {},
    );
  });

  it("drops an unreadable position without refusing the record", () => {
    // A position is disposable; the rank the record carries is not.
    const raw = JSON.stringify({
      ...record({ lessons: { tour: FINISHED } }),
      lessonPositions: { a: 2, b: -1, c: 1.5, d: "3", " ": 4 },
    });
    const parsed = parseAcademyRecord(raw);
    deepStrictEqual(parsed?.lessonPositions, { a: 2 });
    deepStrictEqual(parsed?.lessons.tour, FINISHED);
    const garbage = JSON.stringify({ ...record(), lessonPositions: [1, 2] });
    deepStrictEqual(parseAcademyRecord(garbage)?.lessonPositions, {});
  });
});

describe("recordLessonPosition", () => {
  it("keeps the beat a run reached, on a fresh or existing record", () => {
    strictEqual(
      recordLessonPosition(null, "tour", 0, NOW)?.lessonPositions.tour,
      0,
    );
    const next = recordLessonPosition(record(), "tour", 2, NOW);
    strictEqual(next?.lessonPositions.tour, 2);
    strictEqual(next?.updatedAt, NOW.toISOString());
  });

  it("writes nothing for a finished lesson, so a replay never un-finishes it", () => {
    const done = record({ lessons: { tour: FINISHED } });
    strictEqual(recordLessonPosition(done, "tour", 1, NOW), done);
  });

  it("writes nothing when the position is already the one stored", () => {
    const paused = record({ lessonPositions: { tour: 2 } });
    strictEqual(recordLessonPosition(paused, "tour", 2, NOW), paused);
  });

  it("refuses an empty id or a beat that is not a whole index", () => {
    throws(() => recordLessonPosition(null, " ", 0, NOW), RangeError);
    throws(() => recordLessonPosition(null, "tour", -1, NOW), RangeError);
    throws(() => recordLessonPosition(null, "tour", 0.5, NOW), RangeError);
  });

  it("is cleared by finishing, in the same write that pays", () => {
    const paused = record({ lessonPositions: { tour: 2, email: 1 } });
    const done = completeLessonRecord(paused, "tour", 20, NOW);
    deepStrictEqual(done.lessonPositions, { email: 1 });
    strictEqual(done.lessons.tour?.experience, 20);
  });
});

describe("merging positions", () => {
  it("keeps the further beat, since a run only moves forward", () => {
    const a = record({ lessonPositions: { tour: 1, email: 4 } });
    const b = record({ lessonPositions: { tour: 3 } });
    deepStrictEqual(mergeAcademyRecords(a, b)?.lessonPositions, {
      tour: 3,
      email: 4,
    });
  });

  it("drops a position for a lesson either copy finished", () => {
    const paused = record({ lessonPositions: { tour: 2 } });
    const done = record({ lessons: { tour: FINISHED } });
    deepStrictEqual(mergeAcademyRecords(paused, done)?.lessonPositions, {});
    deepStrictEqual(mergeAcademyRecords(done, paused)?.lessonPositions, {});
  });
});

describe("a position past the end of a shipped lesson", () => {
  // The tour ships seven beats: a position of 9 was kept by a longer version
  // of it and names a beat that no longer exists.
  const TOUR = HOUSTON_TOUR_LESSON_ID;

  it("is dropped by the merge, so a fresh run's place is not buried", () => {
    const stale = record({ lessonPositions: { [TOUR]: 9 } });
    const fresh = record({ lessonPositions: { [TOUR]: 2 } });
    deepStrictEqual(mergeAcademyRecords(stale, fresh)?.lessonPositions, {
      [TOUR]: 2,
    });
    deepStrictEqual(mergeAcademyRecords(fresh, stale)?.lessonPositions, {
      [TOUR]: 2,
    });
    deepStrictEqual(mergeAcademyRecords(stale, record())?.lessonPositions, {});
  });

  it("is refused by record", () => {
    throws(() => recordLessonPosition(null, TOUR, 7, NOW), RangeError);
    strictEqual(
      recordLessonPosition(null, TOUR, 6, NOW)?.lessonPositions[TOUR],
      6,
    );
  });

  it("gives way to the beat a restarted run reaches, through the queue", async () => {
    let local: string | null = serializeAcademyRecord(
      record({ lessonPositions: { [TOUR]: 9 } }),
    );
    let engine: string | null = local;
    const ports = academyPortsFor(
      {
        getPreference: async () => engine,
        setPreference: async (_key, value) => {
          engine = value;
        },
        readLocal: () => local,
        writeLocal: (_key, value) => {
          local = value;
        },
      },
      "u1",
      () => "u1",
    );
    const queue = createAcademyMutationQueue(ports, () => "device");
    const saved = await queue.run((r) => recordLessonPosition(r, TOUR, 0, NOW));
    strictEqual(saved?.lessonPositions[TOUR], 0);
    strictEqual(parseAcademyRecord(local)?.lessonPositions[TOUR], 0);
  });
});

describe("lessonStartIndex", () => {
  const tour = (beats: number): LessonSpec => ({
    id: "tour",
    chapterId: "getting-started",
    experience: 10,
    steps: Array.from({ length: beats }, (_, i) => ({
      kind: "card" as const,
      id: `beat-${i}`,
    })),
  });

  it("opens a new or finished lesson on its first beat", () => {
    strictEqual(lessonStartIndex(null, tour(4)), 0);
    strictEqual(lessonStartIndex(record(), tour(4)), 0);
    const done = record({
      lessons: { tour: FINISHED },
      lessonPositions: { tour: 2 },
    });
    strictEqual(lessonStartIndex(done, tour(4)), 0);
  });

  it("resumes a started lesson where it was left", () => {
    const paused = record({ lessonPositions: { tour: 2 } });
    strictEqual(lessonStartIndex(paused, tour(4)), 2);
  });

  it("opens on the first beat when the lesson lost the beat it was on", () => {
    const paused = record({ lessonPositions: { tour: 5 } });
    strictEqual(lessonStartIndex(paused, tour(3)), 0);
  });

  it("opens a beat that stands on an earlier choice on that choice", () => {
    // The choice lives in session memory only, so a run resumed after a
    // restart must ask it again rather than act on a default.
    const spec: LessonSpec = {
      ...tour(0),
      steps: [
        { kind: "card", id: "intro" },
        { kind: "panel", id: "pick", panel: "emailSender" },
        { kind: "panel", id: "act", panel: "emailConnect", resumeOn: "pick" },
        {
          kind: "spotlight",
          id: "press",
          target: "[data-tour='send']",
          advanceOn: { type: "conversationCreated" },
          resumeOn: "pick",
        },
        { kind: "card", id: "done" },
      ],
    };
    const on = (index: number) =>
      lessonStartIndex(record({ lessonPositions: { tour: index } }), spec);
    strictEqual(on(2), 1);
    strictEqual(on(3), 1);
    strictEqual(on(1), 1);
    strictEqual(on(4), 4);
  });

  it("resumes the shipped email lesson's ask on the sender choice", () => {
    const email = academyLesson(EMPLOYEE_EMAIL_LESSON_ID);
    ok(email);
    const at = (id: string) => email.steps.findIndex((step) => step.id === id);
    const pausedOn = (id: string) =>
      lessonStartIndex(
        record({ lessonPositions: { [EMPLOYEE_EMAIL_LESSON_ID]: at(id) } }),
        email,
      );
    strictEqual(pausedOn("ask"), at("sender"));
    // The task is already sent: asking again would send a second email, so
    // the watch beat resumes where it stood.
    strictEqual(pausedOn("watch"), at("watch"));
  });
});

describe("lessonBeatView", () => {
  const spec: LessonSpec = {
    id: "tour",
    chapterId: "getting-started",
    experience: 10,
    steps: [
      { kind: "card", id: "intro" },
      {
        kind: "spotlight",
        id: "board",
        target: "[data-tour='board']",
        navigate: { viewId: "team" },
        advanceOn: { type: "viewReached", viewId: "team" },
      },
      {
        kind: "spotlight",
        id: "newTask",
        target: "[data-tour='newMission']",
        advanceOn: { type: "conversationCreated" },
      },
      { kind: "card", id: "outro" },
    ],
  };

  it("honours only the beat's own navigate when a run advances", () => {
    strictEqual(lessonBeatView(spec, 1, "advance"), "team");
    strictEqual(lessonBeatView(spec, 2, "advance"), null);
  });

  it("walks back to the last navigate when a run opens mid-lesson", () => {
    // Resumed from the Academy on a spotlight whose target lives on the
    // screen an earlier beat navigated to.
    strictEqual(lessonBeatView(spec, 2, "open"), "team");
    strictEqual(lessonBeatView(spec, 3, "open"), "team");
    strictEqual(lessonBeatView(spec, 0, "open"), null);
  });
});
