import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  lessonBeatArmed,
  lessonExitKey,
} from "../src/components/academy/lessons/lesson-arming.ts";
import {
  ACADEMY_LESSONS,
  EMPLOYEE_EMAIL_LESSON_ID,
} from "../src/components/academy/lessons/registry.ts";
import {
  type LessonSignals,
  lessonAdvance,
  lessonSignalMet,
} from "../src/lib/academy/lesson-signals.ts";
import type { LessonStepSpec } from "../src/lib/academy/lesson-spec.ts";

// Arming: WHEN a beat may expose the real control it points
// at. A beat that compares the world against a snapshot is blind until that
// snapshot exists, so opening its target first is how a lesson gets stranded.

function world(over: Partial<LessonSignals> = {}): LessonSignals {
  return {
    viewMode: "team",
    hostEventsSinceArmed: new Set(),
    conversationCount: null,
    conversationBaseline: null,
    activeToolkits: null,
    companionReady: false,
    ...over,
  };
}

const newTask: LessonStepSpec = {
  kind: "spotlight",
  id: "newTask",
  target: "[data-tour='newMission']",
  advanceOn: { type: "conversationCreated" },
};

describe("a beat that waits for a conversation", () => {
  it("can never fire once the baseline lands after the user has acted", () => {
    // The stranding itself: the sweep that finally settles already contains
    // the conversation the user just made, so the snapshot taken from it and
    // the live count agree forever and the beat waits for nothing.
    const baselineTakenTooLate = world({
      conversationCount: 3,
      conversationBaseline: 3,
    });
    strictEqual(
      lessonSignalMet({ type: "conversationCreated" }, baselineTakenTooLate),
      false,
    );
  });

  it("keeps its target shut while the baseline is missing", () => {
    strictEqual(lessonBeatArmed(newTask, world()), false);
    // Even a known live count is not enough: without the snapshot there is
    // nothing to have grown past.
    strictEqual(
      lessonBeatArmed(newTask, world({ conversationCount: 2 })),
      false,
    );
  });

  it("opens its target the moment the baseline is taken", () => {
    const armed = world({ conversationCount: 2, conversationBaseline: 2 });
    strictEqual(lessonBeatArmed(newTask, armed), true);
    // An empty workspace is a real baseline, not a missing one.
    strictEqual(
      lessonBeatArmed(
        newTask,
        world({ conversationCount: 0, conversationBaseline: 0 }),
      ),
      true,
    );
  });
});

describe("a beat that snapshots nothing", () => {
  it("arms immediately", () => {
    const viewBeat: LessonStepSpec = {
      ...newTask,
      advanceOn: { type: "viewReached", viewId: "academy" },
    };
    const eventBeat: LessonStepSpec = {
      ...newTask,
      advanceOn: { type: "hostEvent", event: "ConversationsChanged" },
    };
    strictEqual(lessonBeatArmed(viewBeat, world()), true);
    strictEqual(lessonBeatArmed(eventBeat, world()), true);
  });

  it("arms a tour stop and a connection wait at once", () => {
    // Neither compares against a snapshot: a Next waits on nothing, and a
    // connection made before the list answers is simply in the list.
    const tourStop: LessonStepSpec = {
      ...newTask,
      advanceOn: { type: "acknowledged" },
    };
    const connectionBeat: LessonStepSpec = {
      ...newTask,
      advanceOn: { type: "integrationConnected", toolkits: ["gmail"] },
    };
    strictEqual(lessonBeatArmed(tourStop, world()), true);
    strictEqual(lessonBeatArmed(connectionBeat, world()), true);
  });

  it("holds the email lesson's Send shut until its companion has noted the sender's tasks", () => {
    // The user presses the real composer's Send: a press before the note
    // would make the new task one the lesson already knew, stranding it.
    const ask = ACADEMY_LESSONS[EMPLOYEE_EMAIL_LESSON_ID].steps.find(
      (step) => step.id === "ask",
    );
    ok(ask);
    const settled = world({ conversationCount: 3, conversationBaseline: 3 });
    strictEqual(lessonBeatArmed(ask, settled), false);
    strictEqual(
      lessonBeatArmed(ask, { ...settled, companionReady: true }),
      true,
    );
  });

  it("never moves the email lesson's ask on someone else's conversation", () => {
    // Only the companion, which knows the sender, ends the ask: a routine
    // firing elsewhere, or old tasks a partial sweep fills in later, grow the
    // count without the user pressing Send.
    const ask = ACADEMY_LESSONS[EMPLOYEE_EMAIL_LESSON_ID].steps.find(
      (step) => step.id === "ask",
    );
    ok(ask);
    const grown = world({
      conversationCount: 9,
      conversationBaseline: 3,
      companionReady: true,
    });
    strictEqual(lessonAdvance(ask, grown).kind, "stay");
  });

  it("waits on the user's own press to leave the email lesson's watch", () => {
    // Its companion may finish it early; the world alone never does.
    const watch = ACADEMY_LESSONS[EMPLOYEE_EMAIL_LESSON_ID].steps.find(
      (step) => step.id === "watch",
    );
    ok(watch);
    strictEqual(lessonBeatArmed(watch, world()), true);
    strictEqual(
      lessonAdvance(
        watch,
        world({ conversationCount: 9, conversationBaseline: 1 }),
      ).kind,
      "stay",
    );
  });

  it("arms a panel, which points at nothing", () => {
    const panel: LessonStepSpec = {
      kind: "panel",
      id: "sender",
      panel: "emailSender",
    };
    strictEqual(lessonBeatArmed(panel, world()), true);
  });

  it("arms narration beats, which point at nothing", () => {
    const video: LessonStepSpec = { kind: "video", id: "watch", videoId: "v" };
    const card: LessonStepSpec = { kind: "card", id: "intro" };
    strictEqual(lessonBeatArmed(video, world()), true);
    strictEqual(lessonBeatArmed(card, world()), true);
  });
});

/**
 * The lesson takes Escape from the whole window while it runs, so it has to be
 * sure the key came from a person.
 */
describe("the key that ends a lesson", () => {
  const key = (patch: Partial<Parameters<typeof lessonExitKey>[0]> = {}) => ({
    key: "Escape",
    defaultPrevented: false,
    isTrusted: true,
    ...patch,
  });

  it("is a real Escape press", () => {
    strictEqual(lessonExitKey(key()), true);
  });

  it("is not another key, and not one already handled", () => {
    strictEqual(lessonExitKey(key({ key: "Enter" })), false);
    strictEqual(lessonExitKey(key({ defaultPrevented: true })), false);
  });

  it("is never one the app dispatched at itself", () => {
    // Leaving a kept-alive screen with a modal open fires a synthetic Escape
    // to close it (`components/shell/keep-alive-views.tsx`). Read as the
    // user's, it would drop the run the user is in the middle of, silently.
    strictEqual(lessonExitKey(key({ isTrusted: false })), false);
  });
});
