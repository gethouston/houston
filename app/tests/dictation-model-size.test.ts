import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DICTATION_MODEL_FALLBACK_MB,
  dictationSizeMb,
} from "../src/lib/dictation/types.ts";

const modelRs = readFileSync(
  new URL("../src-tauri/src/dictation/model.rs", import.meta.url),
  "utf8",
);

describe("dictation model size fallback", () => {
  it("shows what the shell's real model size shows", () => {
    const match = /const MODEL_SIZE_BYTES: u64 = ([\d_]+);/.exec(modelRs);
    assert.ok(match, "MODEL_SIZE_BYTES not found in model.rs");
    const bytes = Number(match[1].replaceAll("_", ""));
    assert.equal(dictationSizeMb(bytes), DICTATION_MODEL_FALLBACK_MB);
  });
});
