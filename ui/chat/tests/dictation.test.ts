import { deepEqual, equal } from "node:assert";
import { describe, it } from "node:test";
import type {
  DictationControl,
  DictationState,
} from "../src/dictation-types.ts";
import {
  DEFAULT_DICTATION_LABELS,
  formatElapsed,
  isDictationActive,
  isDictationBusy,
  isDictationCapturing,
  resolveDictationView,
} from "../src/dictation-types.ts";

const control = (
  state: DictationState,
  recordingStartedAt?: number,
): DictationControl => ({
  state,
  recordingStartedAt,
  onStart: () => {},
  onStop: () => {},
  onCancel: () => {},
  labels: DEFAULT_DICTATION_LABELS,
});

describe("resolveDictationView", () => {
  it("hides when no control is provided (web build)", () => {
    deepEqual(resolveDictationView(undefined), { kind: "hidden" });
  });

  it("renders the idle mic button", () => {
    deepEqual(resolveDictationView(control("idle")), { kind: "idle" });
  });

  it("shows a distinct requesting view (empty track, no bars yet)", () => {
    deepEqual(resolveDictationView(control("requesting")), {
      kind: "requesting",
    });
  });

  it("shows the recording view with the start time while recording", () => {
    deepEqual(resolveDictationView(control("recording", 1000)), {
      kind: "recording",
      startedAt: 1000,
    });
  });

  it("shows the transcribing view", () => {
    deepEqual(resolveDictationView(control("transcribing")), {
      kind: "transcribing",
    });
  });
});

describe("isDictationActive (composer takeover)", () => {
  it("is false when absent or idle", () => {
    equal(isDictationActive(undefined), false);
    equal(isDictationActive(control("idle")), false);
  });

  it("is true for requesting, recording, and transcribing", () => {
    equal(isDictationActive(control("requesting")), true);
    equal(isDictationActive(control("recording")), true);
    equal(isDictationActive(control("transcribing")), true);
  });
});

describe("isDictationBusy (submit gating)", () => {
  it("is false when absent or idle", () => {
    equal(isDictationBusy(undefined), false);
    equal(isDictationBusy(control("idle")), false);
  });

  it("is true for every active state", () => {
    equal(isDictationBusy(control("requesting")), true);
    equal(isDictationBusy(control("recording")), true);
    equal(isDictationBusy(control("transcribing")), true);
  });
});

describe("isDictationCapturing (Escape cancels)", () => {
  it("captures only while requesting or recording", () => {
    equal(isDictationCapturing(control("requesting")), true);
    equal(isDictationCapturing(control("recording")), true);
  });

  it("does not capture when idle, transcribing, or absent", () => {
    equal(isDictationCapturing(control("idle")), false);
    equal(isDictationCapturing(control("transcribing")), false);
    equal(isDictationCapturing(undefined), false);
  });
});

describe("Escape while recording fires onCancel and nothing else", () => {
  // Mirrors chat-input handleKeyDown: capture states route Escape to onCancel.
  it("calls onCancel exactly once, never onStop", () => {
    let cancels = 0;
    let stops = 0;
    const c: DictationControl = {
      ...control("recording", Date.now()),
      onCancel: () => {
        cancels += 1;
      },
      onStop: () => {
        stops += 1;
      },
    };
    if (isDictationCapturing(c)) c.onCancel();
    equal(cancels, 1);
    equal(stops, 0);
  });
});

describe("formatElapsed", () => {
  it("is 0:00 before the capture starts (requesting)", () => {
    equal(formatElapsed(undefined, 5000), "0:00");
  });

  it("floors to whole seconds and zero-pads", () => {
    equal(formatElapsed(0, 5900), "0:05");
    equal(formatElapsed(0, 9000), "0:09");
  });

  it("rolls minutes over at 60 seconds", () => {
    equal(formatElapsed(0, 60_000), "1:00");
    equal(formatElapsed(0, 125_000), "2:05");
  });

  it("clamps a backwards clock to 0:00", () => {
    equal(formatElapsed(5000, 1000), "0:00");
  });
});
