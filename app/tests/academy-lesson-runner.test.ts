import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { lessonStepPosition } from "../src/components/academy/lessons/lesson-progress.ts";
import type { LessonSpec } from "../src/lib/academy/lesson-spec.ts";

/**
 * The rule every beat's chrome stands on: what the counter says about where the
 * run is. Pure, and the kind of rule that fails silently in the UI — a counter
 * that reads past the end of the lesson.
 */

const spec: LessonSpec = {
  id: "test-lesson",
  chapterId: "chapter-test",
  experience: 20,
  steps: [
    { kind: "video", id: "watch", videoId: "test-lesson" },
    { kind: "card", id: "intro" },
    {
      kind: "spotlight",
      id: "act",
      target: "[data-tour='newMission']",
      advanceOn: { type: "conversationCreated" },
    },
  ],
};

describe("lesson step position", () => {
  it("counts the position 1-based and never past the end", () => {
    strictEqual(lessonStepPosition(spec, 0), 1);
    strictEqual(lessonStepPosition(spec, 2), 3);
    // The finishing commit clears the run while the surface is still mounted.
    strictEqual(lessonStepPosition(spec, 3), 3);
  });
});
