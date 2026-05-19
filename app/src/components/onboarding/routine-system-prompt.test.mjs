import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendRoutineSection,
  stripRoutineSection,
} from "./routine-system-prompt.ts";

const BASE = "# Personal assistant\n\nFocus: stay organized.\n";

test("append adds the routine section once", () => {
  const out = appendRoutineSection(BASE);
  assert.match(out, /HOUSTON_ROUTINE_BEGIN/);
  assert.match(out, /HOUSTON_ROUTINE_END/);
  assert.match(out, /Make-it-a-routine mode/);
});

test("append is idempotent — second call is a no-op", () => {
  const once = appendRoutineSection(BASE);
  const twice = appendRoutineSection(once);
  assert.equal(once, twice);
});

test("strip removes the appended section cleanly", () => {
  const appended = appendRoutineSection(BASE);
  const stripped = stripRoutineSection(appended);
  assert.equal(stripped.trimEnd(), BASE.trimEnd());
});

test("strip is idempotent on text without the section", () => {
  assert.equal(stripRoutineSection(BASE), BASE);
});

test("strip preserves unrelated content around the section", () => {
  const before = "# Header\n\nIntro paragraph.\n";
  const after = "\n## Footer\n\nClosing note.\n";
  const augmented = appendRoutineSection(before) + after;
  const stripped = stripRoutineSection(augmented);
  assert.match(stripped, /Header/);
  assert.match(stripped, /Closing note/);
  assert.doesNotMatch(stripped, /HOUSTON_ROUTINE_BEGIN/);
  assert.doesNotMatch(stripped, /Make-it-a-routine/);
});
