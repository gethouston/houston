import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type DictationMachineState,
  dictationReducer,
  INITIAL_DICTATION_STATE,
} from "../src/lib/dictation/dictation-reducer.ts";

describe("dictationReducer", () => {
  it("starts idle", () => {
    deepStrictEqual(INITIAL_DICTATION_STATE, { phase: "idle" });
  });

  it("idle -> requesting -> recording -> transcribing -> idle (happy path)", () => {
    let state: DictationMachineState = INITIAL_DICTATION_STATE;
    state = dictationReducer(state, { type: "start" });
    strictEqual(state.phase, "requesting");

    state = dictationReducer(state, { type: "micGranted", startedAt: 1000 });
    strictEqual(state.phase, "recording");
    strictEqual(state.recordingStartedAt, 1000);

    state = dictationReducer(state, { type: "stop" });
    strictEqual(state.phase, "transcribing");

    state = dictationReducer(state, { type: "transcribeSettled" });
    strictEqual(state.phase, "idle");
  });

  it("120s auto-stop behaves identically to a user-initiated stop", () => {
    const recording: DictationMachineState = {
      phase: "recording",
      recordingStartedAt: 1000,
    };
    const stopped = dictationReducer(recording, { type: "autoStop" });
    strictEqual(stopped.phase, "transcribing");
  });

  it("mic permission denial returns to idle (error path)", () => {
    const requesting: DictationMachineState = { phase: "requesting" };
    const next = dictationReducer(requesting, { type: "micFailed" });
    strictEqual(next.phase, "idle");
  });

  it("cancel discards a requesting or recording capture", () => {
    strictEqual(
      dictationReducer({ phase: "requesting" }, { type: "cancel" }).phase,
      "idle",
    );
    strictEqual(
      dictationReducer(
        { phase: "recording", recordingStartedAt: 5 },
        { type: "cancel" },
      ).phase,
      "idle",
    );
  });

  it("cancel is a no-op while transcribing (nothing left to discard)", () => {
    const transcribing: DictationMachineState = { phase: "transcribing" };
    const next = dictationReducer(transcribing, { type: "cancel" });
    strictEqual(next, transcribing);
  });

  it("stop/micGranted/transcribeSettled are no-ops from the wrong phase", () => {
    const idle: DictationMachineState = { phase: "idle" };
    strictEqual(dictationReducer(idle, { type: "stop" }), idle);
    strictEqual(dictationReducer(idle, { type: "autoStop" }), idle);
    strictEqual(
      dictationReducer(idle, { type: "micGranted", startedAt: 1 }),
      idle,
    );
    strictEqual(dictationReducer(idle, { type: "transcribeSettled" }), idle);

    const recording: DictationMachineState = { phase: "recording" };
    strictEqual(dictationReducer(recording, { type: "start" }), recording);
  });

  it("reset forces idle from any phase, and is a no-op if already idle", () => {
    strictEqual(
      dictationReducer({ phase: "transcribing" }, { type: "reset" }).phase,
      "idle",
    );
    const idle: DictationMachineState = { phase: "idle" };
    strictEqual(dictationReducer(idle, { type: "reset" }), idle);
  });
});
