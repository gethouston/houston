import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ACADEMY_LESSONS,
  academyLesson,
} from "../src/components/academy/lessons/registry.ts";
import {
  lessonCopyKey,
  lessonStepCopyFields,
  lessonStepCopyKey,
} from "../src/lib/academy/lesson-spec.ts";

/**
 * The registry is content: nothing type-checks a lesson's COPY, because its
 * keys are built at runtime from the ids. This is what does — every key a
 * shipped lesson will ask for must resolve in the English locale, or the beat
 * renders a raw key at a user.
 */
const academyCopy = JSON.parse(
  readFileSync(
    new URL("../src/locales/en/academy.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

/** The value at a dotted key, or undefined. */
function copyAt(key: string): unknown {
  let node: unknown = academyCopy;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function isSentence(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The shared lesson chrome the runner renders, by its full key. Every one of
 * them sits under `lessons.` — the very node a lesson's own copy is filed in —
 * so this list is also the list of ids a lesson may never take.
 */
const CHROME_KEYS = [
  "lessons.exit",
  "lessons.progress",
  "lessons.stepCount",
  "lessons.video.kicker",
  "lessons.video.continue",
  "lessons.video.comingSoon",
];

/** The first segment under `lessons.` that the chrome owns. */
const RESERVED_IDS = new Set(CHROME_KEYS.map((key) => key.split(".")[1]));

const lessons = Object.entries(ACADEMY_LESSONS);

describe("academy lesson registry", () => {
  it("ships at least one lesson", () => {
    ok(lessons.length > 0);
  });

  it("keys every lesson by its own id", () => {
    for (const [key, lesson] of lessons) strictEqual(lesson.id, key);
  });

  it("books every lesson into a chapter and pays real experience", () => {
    for (const [, lesson] of lessons) {
      ok(lesson.chapterId.trim().length > 0, `${lesson.id} has no chapter`);
      ok(
        Number.isFinite(lesson.experience) && lesson.experience > 0,
        `${lesson.id} pays nothing`,
      );
    }
  });

  it("gives every lesson beats, with ids unique inside the lesson", () => {
    for (const [, lesson] of lessons) {
      ok(lesson.steps.length > 0, `${lesson.id} has no beats`);
      const ids = lesson.steps.map((step) => step.id);
      strictEqual(
        new Set(ids).size,
        ids.length,
        `${lesson.id} repeats a step id`,
      );
      for (const id of ids) ok(id.trim().length > 0);
    }
  });

  it("asks for a real video on every video beat, and a real target on every spotlight", () => {
    for (const [, lesson] of lessons) {
      for (const step of lesson.steps) {
        if (step.kind === "video")
          ok(step.videoId.trim().length > 0, `${lesson.id}/${step.id}`);
        if (step.kind === "spotlight") {
          // Built by `tourSelector`/`tutorialSelector`, so an attribute
          // selector is what a well-formed target looks like.
          ok(
            step.target.startsWith("[data-") && step.target.endsWith("]"),
            `${lesson.id}/${step.id} has a hand-written target`,
          );
        }
      }
    }
  });

  it("resolves the lesson's own name and line", () => {
    for (const [, lesson] of lessons) {
      for (const field of ["title", "description"] as const) {
        const key = lessonCopyKey(lesson.id, field);
        ok(isSentence(copyAt(key)), `missing academy:${key}`);
      }
    }
  });

  it("resolves every word each beat will ask for", () => {
    for (const [, lesson] of lessons) {
      for (const step of lesson.steps) {
        const { required, optional } = lessonStepCopyFields(step);
        for (const field of required) {
          const key = lessonStepCopyKey(lesson.id, step.id, field);
          ok(isSentence(copyAt(key)), `missing academy:${key}`);
        }
        for (const field of optional) {
          const value = copyAt(lessonStepCopyKey(lesson.id, step.id, field));
          ok(
            value === undefined || isSentence(value),
            `empty academy:${lessonStepCopyKey(lesson.id, step.id, field)}`,
          );
        }
      }
    }
  });

  it("carries the shared lesson chrome the runner renders", () => {
    for (const key of CHROME_KEYS) {
      ok(isSentence(copyAt(key)), `missing academy:${key}`);
    }
  });

  it("keeps every lesson id a slug, clear of the chrome's own keys", () => {
    for (const [, lesson] of lessons) {
      // Lowercase slug: the id is half of a runtime copy key, so anything
      // with a dot, a space or a capital would resolve somewhere else.
      ok(
        /^[a-z0-9-]+$/.test(lesson.id),
        `${lesson.id} is not a lowercase slug`,
      );
      ok(
        !RESERVED_IDS.has(lesson.id),
        `${lesson.id} collides with the shared lesson chrome`,
      );
    }
  });

  it("files nothing under `lessons` but the chrome and the lessons themselves", () => {
    // The other direction, so the reservation cannot drift: a chrome key added
    // to the locale without being reserved here, or copy left behind by a
    // retired lesson, both fail instead of quietly sharing the node.
    const node = academyCopy.lessons;
    ok(node !== null && typeof node === "object", "no academy:lessons node");
    for (const key of Object.keys(node as Record<string, unknown>)) {
      ok(
        RESERVED_IDS.has(key) || Object.hasOwn(ACADEMY_LESSONS, key),
        `academy:lessons.${key} is neither chrome nor a shipped lesson`,
      );
    }
  });

  it("looks a lesson up by id, and answers undefined for one nothing ships", () => {
    const [id] = lessons[0];
    strictEqual(academyLesson(id)?.id, id);
    strictEqual(academyLesson("no-such-lesson"), undefined);
    // Own-property lookup only: an inherited key is not a lesson.
    strictEqual(academyLesson("toString"), undefined);
  });
});
