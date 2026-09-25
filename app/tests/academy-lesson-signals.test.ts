import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type LessonSignalSpec,
  type LessonSignals,
  lessonAdvance,
  lessonSignalMet,
} from "../src/lib/academy/lesson-signals.ts";
import type { LessonStepSpec } from "../src/lib/academy/lesson-spec.ts";

/** A world where nothing has happened yet. */
function world(over: Partial<LessonSignals> = {}): LessonSignals {
  return {
    viewMode: "agents-home",
    hostEventsSinceArmed: new Set(),
    conversationCount: null,
    conversationBaseline: null,
    activeToolkits: null,
    companionReady: false,
    ...over,
  };
}

function spotlight(advanceOn: LessonSignalSpec): LessonStepSpec {
  return { kind: "spotlight", id: "do-it", target: "[data-x]", advanceOn };
}

const advanced = (step: LessonStepSpec, signals: LessonSignals) =>
  lessonAdvance(step, signals).kind === "advance";

describe("lesson signals — viewReached", () => {
  const spec: LessonSignalSpec = { type: "viewReached", viewId: "academy" };

  it("waits while the user is elsewhere", () => {
    strictEqual(lessonSignalMet(spec, world()), false);
  });

  it("is met the moment that view is on screen", () => {
    strictEqual(lessonSignalMet(spec, world({ viewMode: "academy" })), true);
  });
});

describe("lesson signals — hostEvent", () => {
  const spec: LessonSignalSpec = {
    type: "hostEvent",
    event: "ConversationsChanged",
  };

  it("waits while nothing has been heard since the beat armed", () => {
    strictEqual(lessonSignalMet(spec, world()), false);
  });

  it("ignores every other event on the firehose", () => {
    const signals = world({ hostEventsSinceArmed: new Set(["FilesChanged"]) });
    strictEqual(lessonSignalMet(spec, signals), false);
  });

  it("is met by its own event", () => {
    const signals = world({
      hostEventsSinceArmed: new Set(["FilesChanged", "ConversationsChanged"]),
    });
    strictEqual(lessonSignalMet(spec, signals), true);
  });
});

describe("lesson signals — conversationCreated", () => {
  const spec: LessonSignalSpec = { type: "conversationCreated" };

  it("never fires before the baseline is taken", () => {
    // The sweep has not settled: a count with nothing to compare against
    // would read every conversation the user already had as brand new.
    strictEqual(lessonSignalMet(spec, world({ conversationCount: 7 })), false);
  });

  it("never fires while the live count is unknown", () => {
    strictEqual(
      lessonSignalMet(spec, world({ conversationBaseline: 2 })),
      false,
    );
  });

  it("holds while the count matches the baseline", () => {
    const signals = world({ conversationCount: 2, conversationBaseline: 2 });
    strictEqual(lessonSignalMet(spec, signals), false);
  });

  it("holds when the count SHRANK (a deletion is not a creation)", () => {
    const signals = world({ conversationCount: 1, conversationBaseline: 2 });
    strictEqual(lessonSignalMet(spec, signals), false);
  });

  it("is met when the count grew past the baseline", () => {
    const signals = world({ conversationCount: 3, conversationBaseline: 2 });
    strictEqual(lessonSignalMet(spec, signals), true);
  });

  it("counts a first conversation from an empty baseline", () => {
    const signals = world({ conversationCount: 1, conversationBaseline: 0 });
    strictEqual(lessonSignalMet(spec, signals), true);
  });
});

describe("lesson signals — integrationConnected", () => {
  const spec: LessonSignalSpec = {
    type: "integrationConnected",
    toolkits: ["gmail", "outlook"],
  };

  it("waits while the connections list has not answered", () => {
    strictEqual(lessonSignalMet(spec, world()), false);
  });

  it("waits while none of its toolkits is connected", () => {
    const signals = world({ activeToolkits: new Set(["slack"]) });
    strictEqual(lessonSignalMet(spec, signals), false);
  });

  it("is met by ANY of its toolkits, including one connected before arrival", () => {
    strictEqual(
      lessonSignalMet(spec, world({ activeToolkits: new Set(["outlook"]) })),
      true,
    );
  });
});

describe("lesson signals — acknowledged and companion", () => {
  it("is never met by the world: only the beat's own Next, or its companion, moves it", () => {
    const everythingHappened = world({
      viewMode: "academy",
      hostEventsSinceArmed: new Set(["ConversationsChanged"]),
      conversationCount: 5,
      conversationBaseline: 1,
      activeToolkits: new Set(["gmail"]),
    });
    strictEqual(
      lessonSignalMet({ type: "acknowledged" }, everythingHappened),
      false,
    );
    strictEqual(
      lessonSignalMet({ type: "companion" }, everythingHappened),
      false,
    );
  });
});

describe("lessonAdvance", () => {
  it("never advances a video beat: its own button does", () => {
    const step: LessonStepSpec = { kind: "video", id: "watch", videoId: "v" };
    strictEqual(advanced(step, world({ viewMode: "academy" })), false);
  });

  it("never advances a card beat", () => {
    const step: LessonStepSpec = { kind: "card", id: "intro" };
    strictEqual(advanced(step, world({ viewMode: "academy" })), false);
  });

  it("advances a spotlight beat exactly when its signal is met", () => {
    const step = spotlight({ type: "viewReached", viewId: "academy" });
    strictEqual(advanced(step, world()), false);
    strictEqual(advanced(step, world({ viewMode: "academy" })), true);
  });

  it("advances a panel beat on its signal, and never one that names none", () => {
    const connect: LessonStepSpec = {
      kind: "panel",
      id: "connect",
      panel: "emailConnect",
      advanceOn: { type: "integrationConnected", toolkits: ["gmail"] },
    };
    const sender: LessonStepSpec = {
      kind: "panel",
      id: "sender",
      panel: "emailSender",
    };
    const connected = world({ activeToolkits: new Set(["gmail"]) });
    strictEqual(advanced(connect, world()), false);
    strictEqual(advanced(connect, connected), true);
    strictEqual(advanced(sender, connected), false);
  });

  it("reads the beat's OWN signal, not any signal being true", () => {
    const step = spotlight({ type: "conversationCreated" });
    const elsewhereReady = world({
      viewMode: "academy",
      hostEventsSinceArmed: new Set(["ConversationsChanged"]),
    });
    strictEqual(advanced(step, elsewhereReady), false);
  });
});
