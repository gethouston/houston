import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { describe, it } from "node:test";
import { mergeAcademyRecords } from "../src/lib/academy/academy-merge.ts";
import {
  type AcademyRecord,
  completeChapterRecord,
  completeLessonRecord,
  LEGACY_DEVICE_ID,
  serializeAcademyRecord,
  totalExperience,
  totalUsagePoints,
} from "../src/lib/academy/academy-record.ts";

import { parseAcademyRecord } from "../src/lib/academy/academy-record-parse.ts";

/** The install these records were earned on. */
const DEVICE = "install-1";

const record = (patch: Partial<AcademyRecord> = {}): AcademyRecord => ({
  version: 1,
  chapters: {
    setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
  },
  lessons: {},
  usageByDevice: { [DEVICE]: 120 },
  usageDay: null,
  usageToday: 0,
  streak: { current: 0, best: 0, lastActiveDay: null },
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

describe("parseAcademyRecord", () => {
  it("round-trips a valid record", () => {
    const value = record({
      lessons: {
        "first-mission": {
          completedAt: "2026-08-02T10:00:00.000Z",
          experience: 10,
        },
      },
      usageDay: "2026-08-02",
      usageToday: 7,
      streak: { current: 3, best: 9, lastActiveDay: "2026-08-02" },
    });
    deepStrictEqual(parseAcademyRecord(serializeAcademyRecord(value)), value);
  });

  it("returns null for nothing at all", () => {
    strictEqual(parseAcademyRecord(null), null);
    strictEqual(parseAcademyRecord("   "), null);
  });

  it("rejects malformed JSON and non-objects", () => {
    strictEqual(parseAcademyRecord("{not json"), null);
    strictEqual(parseAcademyRecord('"a string"'), null);
    strictEqual(parseAcademyRecord("null"), null);
  });

  it("rejects a record written by another version", () => {
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), version: 2 })),
      null,
    );
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), version: undefined })),
      null,
    );
  });

  it("rejects the whole record when one chapter entry is malformed", () => {
    const raw = JSON.stringify({
      ...record(),
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
        broken: { completedAt: "not-a-date", experience: 10 },
      },
    });
    strictEqual(parseAcademyRecord(raw), null);
  });

  it("rejects chapters that are not an object map", () => {
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), chapters: [] })),
      null,
    );
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), chapters: null })),
      null,
    );
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), chapters: undefined })),
      null,
    );
  });

  it("rejects negative and non-finite numbers", () => {
    const negativeChapter = JSON.stringify({
      ...record(),
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: -1 },
      },
    });
    strictEqual(parseAcademyRecord(negativeChapter), null);
    strictEqual(
      parseAcademyRecord(
        JSON.stringify({ ...record(), usageByDevice: { [DEVICE]: -5 } }),
      ),
      null,
    );
    // JSON has no Infinity/NaN literal — they serialize to null, which is
    // exactly what a corrupted writer would leave behind.
    strictEqual(
      parseAcademyRecord(
        JSON.stringify({
          ...record(),
          usageByDevice: { [DEVICE]: Number.NaN },
        }),
      ),
      null,
    );
  });

  it("rejects a missing or unparseable updatedAt", () => {
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), updatedAt: "soon" })),
      null,
    );
  });

  it("reads a record written before the economy existed", () => {
    // The fields are additive: a v1 record from an older build has no lessons,
    // no usage day and no streak, and must still open at its full value. Its
    // points were a single total, which becomes one more install — the one
    // that earned everything up to here, and never earns again.
    const legacy = JSON.stringify({
      version: 1,
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
      },
      usagePoints: 120,
      updatedAt: "2026-08-01T10:00:00.000Z",
    });
    deepStrictEqual(
      parseAcademyRecord(legacy),
      record({ usageByDevice: { [LEGACY_DEVICE_ID]: 120 } }),
    );
  });

  it("counts a record's points once, never the compatibility total too", () => {
    // Every write leaves a `usagePoints` total beside the per-install counters
    // so an older build can still read the record. Counting both would double
    // the user's points on the very next read.
    const raw = serializeAcademyRecord(
      record({ usageByDevice: { [DEVICE]: 80, "install-2": 40 } }),
    );
    strictEqual(JSON.parse(raw).usagePoints, 120);
    strictEqual(totalUsagePoints(parseAcademyRecord(raw)), 120);
  });

  it("reads a record that has spent nothing yet", () => {
    const raw = JSON.stringify({
      ...record(),
      usagePoints: 0,
      usageByDevice: undefined,
    });
    deepStrictEqual(parseAcademyRecord(raw)?.usageByDevice, {});
  });

  it("reads a record that carries no economy at all", () => {
    // The economy fields are ADDITIVE: a record with neither the per-install
    // counters nor the compatibility total is a record from a build that had
    // no economy, and opens at its full value with an empty one. Refusing it
    // would cost that user every chapter they had cleared.
    const raw = JSON.stringify({
      version: 1,
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
      },
      updatedAt: "2026-08-01T10:00:00.000Z",
    });
    deepStrictEqual(parseAcademyRecord(raw), record({ usageByDevice: {} }));
  });

  it("rejects per-install counters that are not a map of counts", () => {
    for (const usageByDevice of [
      [],
      null,
      { "": 5 },
      { [DEVICE]: "many" },
      { [DEVICE]: -1 },
    ]) {
      strictEqual(
        parseAcademyRecord(JSON.stringify({ ...record(), usageByDevice })),
        null,
      );
    }
  });

  it("holds lessons to the same standard as chapters", () => {
    strictEqual(
      parseAcademyRecord(
        JSON.stringify({
          ...record(),
          lessons: { broken: { completedAt: "whenever", experience: 5 } },
        }),
      ),
      null,
    );
    strictEqual(
      parseAcademyRecord(JSON.stringify({ ...record(), lessons: [] })),
      null,
    );
  });

  it("refuses a day stamp that is not a real calendar day", () => {
    for (const usageDay of ["2026-8-1", "2026-02-31", "yesterday", 20260801]) {
      strictEqual(
        parseAcademyRecord(JSON.stringify({ ...record(), usageDay })),
        null,
      );
    }
  });

  it("refuses a malformed streak", () => {
    for (const streak of [
      { current: -1, best: 3, lastActiveDay: null },
      { current: 1, best: 3, lastActiveDay: "not-a-day" },
      { best: 3, lastActiveDay: null },
      [],
    ]) {
      strictEqual(
        parseAcademyRecord(JSON.stringify({ ...record(), streak })),
        null,
      );
    }
  });
});

describe("mergeAcademyRecords", () => {
  it("passes through when one side is missing", () => {
    const value = record();
    deepStrictEqual(mergeAcademyRecords(value, null), value);
    deepStrictEqual(mergeAcademyRecords(null, value), value);
    strictEqual(mergeAcademyRecords(null, null), null);
  });

  it("unions chapters from both devices", () => {
    const merged = mergeAcademyRecords(
      record(),
      record({
        chapters: {
          basics: { completedAt: "2026-08-02T09:00:00.000Z", experience: 30 },
        },
        updatedAt: "2026-08-02T09:00:00.000Z",
      }),
    );
    deepStrictEqual(Object.keys(merged?.chapters ?? {}).sort(), [
      "basics",
      "setup",
    ]);
    strictEqual(merged?.updatedAt, "2026-08-02T09:00:00.000Z");
  });

  it("unions lessons the same way, in either direction", () => {
    const mine = record({
      lessons: {
        a: { completedAt: "2026-08-01T10:00:00.000Z", experience: 10 },
      },
    });
    const theirs = record({
      lessons: {
        b: { completedAt: "2026-08-02T10:00:00.000Z", experience: 20 },
      },
    });
    for (const merged of [
      mergeAcademyRecords(mine, theirs),
      mergeAcademyRecords(theirs, mine),
    ]) {
      deepStrictEqual(Object.keys(merged?.lessons ?? {}).sort(), ["a", "b"]);
      strictEqual(totalExperience(merged), 80);
    }
  });

  it("keeps the earliest completion and the larger award on a conflict", () => {
    const merged = mergeAcademyRecords(
      record({
        chapters: {
          setup: { completedAt: "2026-08-05T10:00:00.000Z", experience: 50 },
        },
      }),
      record({
        chapters: {
          setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 80 },
        },
      }),
    );
    deepStrictEqual(merged?.chapters.setup, {
      completedAt: "2026-08-01T10:00:00.000Z",
      experience: 80,
    });
  });

  it("never lets a stale device downgrade progress", () => {
    const fresh = record({
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
        basics: { completedAt: "2026-08-03T10:00:00.000Z", experience: 100 },
      },
      usageByDevice: { [DEVICE]: 400 },
      updatedAt: "2026-08-03T10:00:00.000Z",
    });
    const stale = record({
      chapters: {
        setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
      },
      usageByDevice: { [DEVICE]: 10 },
      updatedAt: "2026-07-20T10:00:00.000Z",
    });
    for (const merged of [
      mergeAcademyRecords(stale, fresh),
      mergeAcademyRecords(fresh, stale),
    ]) {
      strictEqual(totalExperience(merged), 150);
      strictEqual(totalUsagePoints(merged), 400);
      strictEqual(merged?.updatedAt, "2026-08-03T10:00:00.000Z");
    }
  });

  it("adds up what two devices earned at the same time", () => {
    // Both start the day at 100 and go offline; one earns 5, the other 7. A
    // single total could only keep one of them — 107 — and the other five
    // points would be gone. Per-install counters keep both.
    const base = record({
      usageByDevice: { "install-a": 60, "install-b": 40 },
    });
    const deviceA = record({
      usageByDevice: { ...base.usageByDevice, "install-a": 65 },
    });
    const deviceB = record({
      usageByDevice: { ...base.usageByDevice, "install-b": 47 },
    });
    for (const merged of [
      mergeAcademyRecords(deviceA, deviceB),
      mergeAcademyRecords(deviceB, deviceA),
    ]) {
      strictEqual(totalUsagePoints(merged), 112);
      deepStrictEqual(merged?.usageByDevice, {
        "install-a": 65,
        "install-b": 47,
      });
    }
  });

  it("keeps an install only one copy has ever heard of", () => {
    const merged = mergeAcademyRecords(
      record({ usageByDevice: { "install-a": 10 } }),
      record({ usageByDevice: { "install-b": 3 } }),
    );
    deepStrictEqual(merged?.usageByDevice, {
      "install-a": 10,
      "install-b": 3,
    });
  });

  it("never lets a stale copy of an install take points back", () => {
    const merged = mergeAcademyRecords(
      record({ usageByDevice: { [DEVICE]: 400 } }),
      record({ usageByDevice: { [DEVICE]: 10 } }),
    );
    strictEqual(totalUsagePoints(merged), 400);
  });

  it("takes the daily tally from the later day, never the larger count", () => {
    const yesterday = record({ usageDay: "2026-08-01", usageToday: 20 });
    const today = record({ usageDay: "2026-08-02", usageToday: 3 });
    for (const merged of [
      mergeAcademyRecords(yesterday, today),
      mergeAcademyRecords(today, yesterday),
    ]) {
      strictEqual(merged?.usageDay, "2026-08-02");
      strictEqual(merged?.usageToday, 3);
    }
  });

  it("adds up to the larger count when both copies are on the same day", () => {
    // Two devices spending the SAME day's cap: the bigger tally is the honest
    // one, or the day would pay out twice.
    const merged = mergeAcademyRecords(
      record({ usageDay: "2026-08-02", usageToday: 4 }),
      record({ usageDay: "2026-08-02", usageToday: 11 }),
    );
    strictEqual(merged?.usageToday, 11);
  });

  it("prefers a real day over a record that never spent one", () => {
    const merged = mergeAcademyRecords(
      record({ usageDay: null, usageToday: 0 }),
      record({ usageDay: "2026-08-02", usageToday: 6 }),
    );
    strictEqual(merged?.usageDay, "2026-08-02");
    strictEqual(merged?.usageToday, 6);
  });

  it("keeps the best streak ever and the most recent live one", () => {
    const long = record({
      streak: { current: 12, best: 12, lastActiveDay: "2026-07-01" },
    });
    const recent = record({
      streak: { current: 2, best: 5, lastActiveDay: "2026-08-02" },
    });
    for (const merged of [
      mergeAcademyRecords(long, recent),
      mergeAcademyRecords(recent, long),
    ]) {
      strictEqual(merged?.streak.best, 12);
      strictEqual(merged?.streak.current, 2);
      strictEqual(merged?.streak.lastActiveDay, "2026-08-02");
    }
  });

  it("takes the larger current when both copies share the last active day", () => {
    const merged = mergeAcademyRecords(
      record({ streak: { current: 4, best: 4, lastActiveDay: "2026-08-02" } }),
      record({ streak: { current: 6, best: 6, lastActiveDay: "2026-08-02" } }),
    );
    strictEqual(merged?.streak.current, 6);
    strictEqual(merged?.streak.best, 6);
  });
});

describe("totalExperience", () => {
  it("sums every chapter, and counts nothing as zero", () => {
    strictEqual(totalExperience(null), 0);
    strictEqual(totalExperience(record({ chapters: {} })), 0);
    strictEqual(
      totalExperience(
        record({
          chapters: {
            setup: { completedAt: "2026-08-01T10:00:00.000Z", experience: 50 },
            basics: { completedAt: "2026-08-02T10:00:00.000Z", experience: 30 },
          },
        }),
      ),
      80,
    );
  });

  it("counts lessons into the same pool as chapters", () => {
    strictEqual(
      totalExperience(
        record({
          lessons: {
            a: { completedAt: "2026-08-02T10:00:00.000Z", experience: 10 },
            b: { completedAt: "2026-08-03T10:00:00.000Z", experience: 15 },
          },
        }),
      ),
      75,
    );
  });
});

describe("completeChapterRecord", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("creates a record when the user has none", () => {
    const next = completeChapterRecord(null, "setup", 50, now);
    deepStrictEqual(next.chapters.setup, {
      completedAt: now.toISOString(),
      experience: 50,
    });
    deepStrictEqual(next.lessons, {});
    strictEqual(totalUsagePoints(next), 0);
    strictEqual(next.usageDay, null);
    deepStrictEqual(next.streak, { current: 0, best: 0, lastActiveDay: null });
    strictEqual(next.updatedAt, now.toISOString());
  });

  it("never pays a chapter twice", () => {
    const first = completeChapterRecord(null, "setup", 50, now);
    const again = completeChapterRecord(
      first,
      "setup",
      50,
      new Date("2026-09-01T12:00:00.000Z"),
    );
    strictEqual(again, first);
    strictEqual(totalExperience(again), 50);
    strictEqual(again.chapters.setup?.completedAt, now.toISOString());
  });

  it("refuses an award that would corrupt every later sum", () => {
    throws(() => completeChapterRecord(null, "setup", -1, now), RangeError);
    throws(
      () => completeChapterRecord(null, "setup", Number.NaN, now),
      RangeError,
    );
    throws(() => completeChapterRecord(null, "  ", 50, now), RangeError);
  });
});

describe("completeLessonRecord", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("awards a lesson without touching the chapters", () => {
    const next = completeLessonRecord(null, "what-is-an-agent", 10, now);
    deepStrictEqual(next.lessons["what-is-an-agent"], {
      completedAt: now.toISOString(),
      experience: 10,
    });
    deepStrictEqual(next.chapters, {});
    strictEqual(totalExperience(next), 10);
  });

  it("never pays a lesson twice", () => {
    const first = completeLessonRecord(null, "intro", 10, now);
    const again = completeLessonRecord(
      first,
      "intro",
      10,
      new Date("2026-09-01T12:00:00.000Z"),
    );
    strictEqual(again, first);
    strictEqual(totalExperience(again), 10);
    strictEqual(again.lessons.intro?.completedAt, now.toISOString());
  });

  it("keeps its own namespace: a lesson and a chapter may share an id", () => {
    const withChapter = completeChapterRecord(null, "basics", 50, now);
    const withBoth = completeLessonRecord(withChapter, "basics", 10, now);
    strictEqual(totalExperience(withBoth), 60);
  });

  it("refuses an award that would corrupt every later sum", () => {
    throws(() => completeLessonRecord(null, "intro", -1, now), RangeError);
    throws(() => completeLessonRecord(null, " ", 10, now), RangeError);
  });
});
