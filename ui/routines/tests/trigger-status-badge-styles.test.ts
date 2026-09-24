import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  TRIGGER_DOT_CLASS,
  TRIGGER_TONE_CLASS,
} from "../src/trigger-status-badge-styles.ts";
import type { TriggerBadgeState } from "../src/trigger-status-view.ts";

const STATES: TriggerBadgeState[] = [
  "active",
  "pending",
  "paused_disconnected",
  "paused_revoked",
  "error",
  "unknown",
];

describe("trigger-status-badge styles", () => {
  it("colours the label with the INK of its hue, never the fill", () => {
    // A fill carries its own `-text` label; worn as text it measures 3.4:1
    // (green) and 2.1:1 (amber) in light. The design-tokens contrast test
    // guards the `-ink` variants at 4.5:1 in both themes.
    assert.equal(TRIGGER_TONE_CLASS.active, "text-success-ink");
    assert.equal(TRIGGER_TONE_CLASS.paused_disconnected, "text-warning-ink");
    assert.equal(TRIGGER_TONE_CLASS.paused_revoked, "text-warning-ink");
    assert.equal(TRIGGER_TONE_CLASS.error, "text-danger-ink");
  });

  it("keeps the neutral states muted", () => {
    assert.equal(TRIGGER_TONE_CLASS.pending, "text-ink-muted");
    assert.equal(TRIGGER_TONE_CLASS.unknown, "text-ink-muted");
  });

  it("keeps the dot on the fill tokens, where the hue is a fill", () => {
    assert.equal(TRIGGER_DOT_CLASS.active, "bg-success");
    assert.equal(TRIGGER_DOT_CLASS.paused_disconnected, "bg-warning");
    assert.equal(TRIGGER_DOT_CLASS.error, "bg-danger");
  });

  it("never fills the unknown dot, so 'checking' cannot read as healthy", () => {
    assert.ok(!TRIGGER_DOT_CLASS.unknown.includes("bg-"));
  });

  it("covers exactly the six badge states", () => {
    assert.deepEqual(
      Object.keys(TRIGGER_TONE_CLASS).sort(),
      [...STATES].sort(),
    );
    assert.deepEqual(Object.keys(TRIGGER_DOT_CLASS).sort(), [...STATES].sort());
  });
});
