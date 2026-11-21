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
    strictEqual(
      lessonBeatArmed(newTask, world({ conversationCount: 2 })),
      false,
    );
  });

  it("opens its target the moment the baseline is taken", () => {
    const armed = world({ conversationCount: 2, conversationBaseline: 2 });
    strictEqual(lessonBeatArmed(newTask, armed), true);
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
    strictEqual(lessonExitKey(key({ isTrusted: false })), false);
  });
});
