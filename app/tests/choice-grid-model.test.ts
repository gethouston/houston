import assert from "node:assert/strict";
import test from "node:test";
import {
  groupIntoRows,
  isChipGridKey,
  nextChipIndex,
} from "../src/components/shell/choice-grid-model.ts";

test("chips sharing a measured top are one row of the wrap", () => {
  assert.deepEqual(groupIntoRows([0, 0, 0, 44, 44, 88]), [
    [0, 1, 2],
    [3, 4],
    [5],
  ]);
});

test("an unmeasured run has no rows at all", () => {
  assert.deepEqual(groupIntoRows([]), []);
});

test("a run that never wrapped is a single row", () => {
  assert.deepEqual(groupIntoRows([12, 12, 12]), [[0, 1, 2]]);
});

test("only the grid's own keys are claimed", () => {
  for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.equal(isChipGridKey(key), true);
  }
  assert.equal(isChipGridKey("Home"), true);
  assert.equal(isChipGridKey("End"), true);
  // Enter and Space pick the focused chip; Escape and Tab belong to the dialog.
  for (const key of ["Enter", " ", "Escape", "Tab", "a"]) {
    assert.equal(isChipGridKey(key), false);
  }
});

const ROWS = [[0, 1, 2], [3, 4, 5], [6]];

test("left and right walk the whole run in reading order, across rows", () => {
  assert.equal(nextChipIndex("ArrowRight", 1, ROWS), 2);
  assert.equal(nextChipIndex("ArrowRight", 2, ROWS), 3);
  assert.equal(nextChipIndex("ArrowLeft", 3, ROWS), 2);
});

test("the ends of the run stay put rather than wrapping around", () => {
  assert.equal(nextChipIndex("ArrowLeft", 0, ROWS), null);
  assert.equal(nextChipIndex("ArrowRight", 6, ROWS), null);
});

test("down and up hold the column", () => {
  assert.equal(nextChipIndex("ArrowDown", 1, ROWS), 4);
  assert.equal(nextChipIndex("ArrowUp", 5, ROWS), 2);
});

test("a shorter row takes the focus at its own last chip", () => {
  assert.equal(nextChipIndex("ArrowDown", 5, ROWS), 6);
});

test("there is nothing above the first row or below the last", () => {
  assert.equal(nextChipIndex("ArrowUp", 0, ROWS), null);
  assert.equal(nextChipIndex("ArrowDown", 6, ROWS), null);
});

test("home and end are the ends of the whole question, not of one row", () => {
  // One question is ONE radio group however many labelled runs it is drawn in,
  // so Home and End are its first and last answer — a row is a wrap artefact
  // the user never asked for.
  assert.equal(nextChipIndex("Home", 5, ROWS), 0);
  assert.equal(nextChipIndex("End", 3, ROWS), 6);
  assert.equal(nextChipIndex("Home", 0, ROWS), null);
  assert.equal(nextChipIndex("End", 6, ROWS), null);
});

// Two labelled runs of one question: three chips wrapping into two rows, then
// a heading's gap, then three more. The rows are measured across both.
const RUN_ROWS = groupIntoRows([0, 0, 44, 140, 140, 140]);

test("the runs of one question are measured as one grid", () => {
  assert.deepEqual(RUN_ROWS, [[0, 1], [2], [3, 4, 5]]);
});

test("down and up cross from one run into the next", () => {
  assert.equal(nextChipIndex("ArrowDown", 2, RUN_ROWS), 3);
  assert.equal(nextChipIndex("ArrowUp", 3, RUN_ROWS), 2);
});

test("a run's shorter row takes the crossing focus at its own last chip", () => {
  assert.equal(nextChipIndex("ArrowUp", 5, RUN_ROWS), 2);
  assert.equal(nextChipIndex("ArrowDown", 1, RUN_ROWS), 2);
});

test("left and right read on through the heading into the next run", () => {
  assert.equal(nextChipIndex("ArrowRight", 2, RUN_ROWS), 3);
  assert.equal(nextChipIndex("ArrowLeft", 3, RUN_ROWS), 2);
});

test("home and end reach across the runs of the question", () => {
  assert.equal(nextChipIndex("Home", 4, RUN_ROWS), 0);
  assert.equal(nextChipIndex("End", 1, RUN_ROWS), 5);
});

test("a chip that is not in the measured rows moves nothing", () => {
  assert.equal(nextChipIndex("ArrowRight", 99, ROWS), null);
});
