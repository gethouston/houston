import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { type TaskRowStatus, taskRowGlyph } from "../src/task-row-styles.ts";

/**
 * The task row's status mapping. The promise it guards: a task wears the SAME
 * glyph, tone and spoken name on every surface that lists it, and RUNNING is
 * the only state that moves.
 */

const STATUSES: TaskRowStatus[] = ["needs_you", "running", "done", "archived"];

describe("taskRowGlyph", () => {
  it("answers every status with a glyph, a token tone and a name", () => {
    for (const status of STATUSES) {
      const glyph = taskRowGlyph(status);
      assert.ok(glyph.Icon, `${status} has no icon`);
      assert.ok(glyph.label.length > 0, `${status} has no label`);
      // Tone is a token utility, never a literal colour.
      assert.match(glyph.tone, /^text-(danger|warning|ink-muted)$/);
    }
  });

  it("spins for running and for nothing else", () => {
    assert.equal(taskRowGlyph("running").spin, true);
    for (const status of STATUSES.filter((s) => s !== "running")) {
      assert.equal(taskRowGlyph(status).spin, false, status);
    }
  });

  it("takes the caller's words, falling back to English", () => {
    const labels = { needsYou: "Necesita tu atención", done: "Listo" };
    assert.equal(
      taskRowGlyph("needs_you", labels).label,
      "Necesita tu atención",
    );
    assert.equal(taskRowGlyph("done", labels).label, "Listo");
    // Unnamed states keep the default rather than rendering blank.
    assert.equal(taskRowGlyph("running", labels).label, "Running");
    assert.equal(taskRowGlyph("archived", labels).label, "Archived");
  });

  it("gives attention states their own tone, and settled states the muted one", () => {
    assert.equal(taskRowGlyph("needs_you").tone, "text-danger");
    assert.equal(taskRowGlyph("running").tone, "text-warning");
    assert.equal(taskRowGlyph("done").tone, "text-ink-muted");
    assert.equal(taskRowGlyph("archived").tone, "text-ink-muted");
  });
});
