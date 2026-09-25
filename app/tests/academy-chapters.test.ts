import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  chapterFinishedIn,
  writeFinishedChapter,
} from "../src/lib/academy/academy-chapters.ts";
import { completeLessonRecord } from "../src/lib/academy/academy-record.ts";

const NOW = new Date("2026-09-23T10:00:00.000Z");
const LESSONS = ["houston-tour", "employee-email"];

describe("chapterFinishedIn", () => {
  it("is not finished with nothing or part of it done", () => {
    strictEqual(chapterFinishedIn(null, LESSONS), false);
    const tour = completeLessonRecord(null, "houston-tour", 25, NOW);
    strictEqual(chapterFinishedIn(tour, LESSONS), false);
  });

  it("is finished once every lesson is", () => {
    const tour = completeLessonRecord(null, "houston-tour", 25, NOW);
    const both = completeLessonRecord(tour, "employee-email", 25, NOW);
    strictEqual(chapterFinishedIn(both, LESSONS), true);
  });

  it("is never finished without lessons", () => {
    const tour = completeLessonRecord(null, "houston-tour", 25, NOW);
    strictEqual(chapterFinishedIn(tour, []), false);
  });
});

describe("writeFinishedChapter", () => {
  const tour = completeLessonRecord(null, "houston-tour", 25, NOW);
  const both = completeLessonRecord(tour, "employee-email", 25, NOW);

  it("is the write that finishes the last lesson", () => {
    strictEqual(writeFinishedChapter(tour, both, LESSONS), true);
  });

  it("is not a write that leaves a lesson unfinished", () => {
    strictEqual(writeFinishedChapter(null, tour, LESSONS), false);
  });

  it("is not a replay in a chapter already finished", () => {
    const replay = completeLessonRecord(both, "houston-tour", 25, NOW);
    strictEqual(writeFinishedChapter(both, replay, LESSONS), false);
  });
});
