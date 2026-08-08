import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { clampToRunes } from "../src/rune-clamp.ts";

// The rail's inline rename caps a group name with this. The rule has to be
// RUNES (Unicode code points), because that is the unit the host counting the
// name uses; a UTF-16 cap would halve a name made of astral characters.

describe("clampToRunes", () => {
  it("leaves a value at or under the ceiling untouched", () => {
    assert.equal(clampToRunes("Sales", 60), "Sales");
    assert.equal(clampToRunes("a".repeat(60), 60), "a".repeat(60));
    assert.equal(clampToRunes("", 60), "");
  });

  it("truncates by RUNES, never by UTF-16 units", () => {
    // 80 emoji are 160 UTF-16 units; a `slice(0, 60)` would keep only 30.
    assert.equal(clampToRunes("🙂".repeat(80), 60), "🙂".repeat(60));
    assert.equal(clampToRunes("a".repeat(80), 60), "a".repeat(60));
  });

  it("never splits a surrogate pair", () => {
    for (let max = 0; max <= 6; max++) {
      const clamped = clampToRunes("🙂".repeat(6), max);
      assert.equal(clamped, "🙂".repeat(max));
      assert.equal([...clamped].length, max);
      assert.equal(clamped.length, max * 2);
    }
  });

  it("clamps a negative or non-finite ceiling to nothing rather than throwing", () => {
    assert.equal(clampToRunes("Sales", -1), "");
    assert.equal(clampToRunes("Sales", Number.NaN), "");
  });
});
