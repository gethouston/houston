import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createSliceCoverage } from "../src/lib/all-conversations-coverage.ts";

// Which agents' slices of the cross-agent board come from a read made this
// session. A partial sweep carries a failed agent's last-known (or restored)
// rows forward, and those can be missing tasks that exist.

describe("slice coverage", () => {
  it("knows no slice before anything was read", () => {
    strictEqual(createSliceCoverage().wasRead("/ada"), false);
  });

  it("knows the slices a read answered, and only those", () => {
    const coverage = createSliceCoverage();
    coverage.noteRead(["/ada"]);
    strictEqual(coverage.wasRead("/ada"), true);
    strictEqual(coverage.wasRead("/bob"), false);
  });

  it("forgets everything on reset", () => {
    // A new identity's board is read afresh; the last account's reads say
    // nothing about it.
    const coverage = createSliceCoverage();
    coverage.noteRead(["/ada"]);
    coverage.reset();
    strictEqual(coverage.wasRead("/ada"), false);
  });

  it("tells its readers when a read covers a new slice, rows changed or not", () => {
    // A targeted reread that finds the same rows leaves the board's rows
    // reference untouched; the read itself is what a reader must see.
    const coverage = createSliceCoverage();
    let told = 0;
    const stop = coverage.subscribe(() => told++);
    coverage.noteRead(["/ada"]);
    strictEqual(told, 1);
    // Nothing new covered: nothing to tell.
    coverage.noteRead(["/ada"]);
    strictEqual(told, 1);
    coverage.reset();
    strictEqual(told, 2);
    stop();
    coverage.noteRead(["/bob"]);
    strictEqual(told, 2);
  });
});
