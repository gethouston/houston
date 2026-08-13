import { strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  lessonBeatArmed,
  lessonExitKey,
} from "../src/components/academy/lessons/lesson-arming.ts";
import {
  type LessonSignals,
  lessonSignalMet,
} from "../src/lib/academy/lesson-signals.ts";
import type { LessonStepSpec } from "../src/lib/academy/lesson-spec.ts";
import { useUIStore } from "../src/stores/ui.ts";

// A lesson and the guided setup both play OVER the real app, spotlighting real
// controls. Two of them at once would point at two different things and teach
// neither, so the setup wins: arming it disarms the lesson. The other
// direction (a lesson armed while the setup is already up) is a render rule in
// `components/shell/workspace-shell.tsx`.

afterEach(() => useUIStore.getState().reset());

describe("the guided setup and an Academy lesson", () => {
  it("disarms a running lesson when the setup is armed", () => {
    const s = useUIStore.getState();
    s.setActiveLessonId("send-first-task");

    s.setInAppOnboardingActive(true);

    strictEqual(useUIStore.getState().activeLessonId, null);
    strictEqual(useUIStore.getState().inAppOnboardingActive, true);
  });

  it("leaves a lesson armed after the setup ended alone", () => {
    const s = useUIStore.getState();
    s.setInAppOnboardingActive(true);
    s.setActiveLessonId("send-first-task");

    s.setInAppOnboardingActive(false);

    // Finishing the setup is not a reason to throw away what the user asked
    // for next; the shell simply starts rendering it.
    strictEqual(useUIStore.getState().activeLessonId, "send-first-task");
  });
});

// The other half of arming: WHEN a beat may expose the real control it points
// at. A beat that compares the world against a snapshot is blind until that
// snapshot exists, so opening its target first is how a lesson gets stranded.

function world(over: Partial<LessonSignals> = {}): LessonSignals {
  return {
    viewMode: "team",
    hostEventsSinceArmed: new Set(),
    conversationCount: null,
    conversationBaseline: null,
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
