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

// Mirrors chat-input's document key listener while capturing: Escape discards,
// Enter (no shift) accepts. During transcribing the listener is inactive.
function dispatchCaptureKey(
  c: DictationControl,
  key: string,
  shiftKey = false,
): void {
  if (!isDictationCapturing(c)) return;
  if (key === "Escape") {
    c.onCancel();
    return;
  }
  if (key === "Enter" && !shiftKey) c.onStop();
}

describe("Escape while recording fires onCancel and nothing else", () => {
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
    dispatchCaptureKey(c, "Escape");
    equal(cancels, 1);
    equal(stops, 0);
  });
});

describe("Enter while capturing accepts the recording", () => {
  const spyControl = (state: DictationState) => {
    let cancels = 0;
    let stops = 0;
    const c: DictationControl = {
      ...control(state, Date.now()),
      onCancel: () => {
        cancels += 1;
      },
      onStop: () => {
        stops += 1;
      },
    };
    return {
      c,
      get cancels() {
        return cancels;
      },
      get stops() {
        return stops;
      },
    };
  };

  it("fires onStop exactly once while recording, never onCancel", () => {
    const s = spyControl("recording");
    dispatchCaptureKey(s.c, "Enter");
    equal(s.stops, 1);
    equal(s.cancels, 0);
  });

  it("fires onStop while requesting too", () => {
    const s = spyControl("requesting");
    dispatchCaptureKey(s.c, "Enter");
    equal(s.stops, 1);
  });

  it("does nothing for shift+Enter (newline, not accept)", () => {
    const s = spyControl("recording");
    dispatchCaptureKey(s.c, "Enter", true);
    equal(s.stops, 0);
    equal(s.cancels, 0);
  });

  it("does nothing while transcribing (not a capturing state)", () => {
    const s = spyControl("transcribing");
    dispatchCaptureKey(s.c, "Enter");
    equal(s.stops, 0);
    equal(s.cancels, 0);
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
