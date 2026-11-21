import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createSliceCoverage } from "../src/lib/all-conversations-coverage.ts";

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
    const coverage = createSliceCoverage();
    coverage.noteRead(["/ada"]);
    coverage.reset();
    strictEqual(coverage.wasRead("/ada"), false);
  });

  it("tells its readers when a read covers a new slice, rows changed or not", () => {
    const coverage = createSliceCoverage();
    let told = 0;
    const stop = coverage.subscribe(() => told++);
    coverage.noteRead(["/ada"]);
    strictEqual(told, 1);
    coverage.noteRead(["/ada"]);
    strictEqual(told, 1);
    coverage.reset();
    strictEqual(told, 2);
    stop();
    coverage.noteRead(["/bob"]);
    strictEqual(told, 2);
  });
});
