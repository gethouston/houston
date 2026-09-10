import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dictationErrorExtra,
  dictationErrorText,
  isDictationSidecarFailure,
} from "../src/lib/dictation/sidecar-failure.ts";

// PRODUCT-1731: `transcribe_audio` rejects with either the plain strings the
// composer already matches on, or a `DictationSidecarFailure` object that
// carries whisper-cli's stderr tail. The message text must stay the string
// Sentry has always seen (issue continuity), the tail rides as `extra`.

const crash = {
  kind: "sidecar-failure",
  message: "dictation: whisper exited with exit code: 0xc0000409",
  stderrTail: "ggml.c:9: GGML_ASSERT(rc == 0) failed",
};

describe("dictation rejection shapes", () => {
  it("keeps plain-string sentinels as-is", () => {
    assert.equal(dictationErrorText("model-not-ready"), "model-not-ready");
    assert.equal(dictationErrorExtra("model-not-ready"), undefined);
    assert.equal(isDictationSidecarFailure("model-not-ready"), false);
  });

  it("reads a sidecar failure's message as the error text", () => {
    assert.equal(isDictationSidecarFailure(crash), true);
    assert.equal(dictationErrorText(crash), crash.message);
  });

  it("surfaces the stderr tail as Sentry extra", () => {
    assert.deepEqual(dictationErrorExtra(crash), {
      whisper_stderr_tail: crash.stderrTail,
    });
  });

  it("marks an empty tail so the report says the sidecar printed nothing", () => {
    assert.deepEqual(dictationErrorExtra({ ...crash, stderrTail: "" }), {
      whisper_stderr_tail: "<empty>",
    });
  });

  it("does not mistake other objects for a sidecar failure", () => {
    assert.equal(isDictationSidecarFailure(null), false);
    assert.equal(isDictationSidecarFailure({ message: "x" }), false);
    assert.equal(
      isDictationSidecarFailure({ kind: "sidecar-failure", message: "x" }),
      false,
    );
    assert.equal(dictationErrorText(new Error("boom")), "boom");
    assert.equal(dictationErrorExtra(new Error("boom")), undefined);
  });
});
