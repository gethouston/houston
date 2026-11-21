import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { lessonStepPosition } from "../src/components/academy/lessons/lesson-progress.ts";
import type { LessonSpec } from "../src/lib/academy/lesson-spec.ts";

const spec: LessonSpec = {
  id: "test-lesson",
  chapterId: "getting-started",
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
    strictEqual(lessonStepPosition(spec, 3), 3);
  });
});
