import assert from "node:assert/strict";
import test from "node:test";
import {
  type ChoiceSection,
  choiceSearchEmptyState,
  enterAction,
  foldForSearch,
  isChoiceSearchable,
  rovingChipId,
  SEARCH_THRESHOLD,
} from "../src/components/shell/choice-step-model.ts";

const SECTIONS: ChoiceSection[] = [
  {
    id: "own",
    options: [
      { id: "paralegal", label: "Paralegal" },
      { id: "case_summarizer", label: "Case summarizer" },
    ],
  },
  {
    id: "common",
    label: "More roles",
    options: [
      { id: "researcher", label: "Researcher" },
      { id: "writer", label: "Writer" },
    ],
  },
];

test("search folds case and accents, so plain typing finds accented labels", () => {
  assert.equal(foldForSearch("Análisis"), "analisis");
  assert.equal(foldForSearch("CASE"), "case");
});

test("a filter field appears once what it can REACH outgrows one glance", () => {
  assert.equal(isChoiceSearchable(SEARCH_THRESHOLD + 1), true);
  assert.equal(isChoiceSearchable(SEARCH_THRESHOLD), false);
});

test("the filter is judged by its reach, never by what is on screen", () => {
  // The role question shows a typed industry ten shared jobs and searches the
  // whole catalog behind them: judging by the four options in SECTIONS would
  // take the filter away and strand the user on that short run.
  const onScreen = SECTIONS.reduce(
    (count, section) => count + section.options.length,
    0,
  );
  assert.ok(onScreen < SEARCH_THRESHOLD);
  assert.equal(isChoiceSearchable(1200), true);
});

test("a query that matches nothing offers the query itself as the answer", () => {
  assert.deepEqual(choiceSearchEmptyState([], "  falconer "), {
    empty: true,
    query: "falconer",
  });
});

test("no query means no empty state, however the runs come back", () => {
  assert.deepEqual(choiceSearchEmptyState([], ""), { empty: false, query: "" });
  assert.deepEqual(choiceSearchEmptyState(SECTIONS, "case"), {
    empty: false,
    query: "case",
  });
});

test("Enter takes the first match the user is looking at", () => {
  assert.deepEqual(enterAction(SECTIONS, "case"), {
    kind: "pick",
    id: "paralegal",
  });
});

test("Enter reads the runs in display order, past any that came back empty", () => {
  // A run can filter down to nothing while a later one still has matches, and
  // the first chip on screen is the one Enter must take.
  const runs: ChoiceSection[] = [
    { id: "own", options: [] },
    { id: "common", label: "More roles", options: SECTIONS[1].options },
  ];
  assert.deepEqual(enterAction(runs, "writer"), {
    kind: "pick",
    id: "researcher",
  });
});

test("Enter on a query nothing matched takes the typed words", () => {
  assert.deepEqual(enterAction([], "falconer"), { kind: "useQuery" });
});

test("Enter on an empty field answers nothing", () => {
  assert.deepEqual(enterAction(SECTIONS, ""), { kind: "none" });
  assert.deepEqual(enterAction([], "   "), { kind: "none" });
});

test("the tab stop is the picked chip while the query still shows it", () => {
  assert.equal(rovingChipId(SECTIONS, "writer", null), "writer");
});

test("a query that filters the pick away moves the tab stop to the first chip", () => {
  // Otherwise the run keeps its only tab stop on a chip nobody can see, and
  // the keyboard cannot get into the question at all.
  assert.equal(rovingChipId(SECTIONS, "falconer", null), "paralegal");
  assert.equal(rovingChipId(SECTIONS, null, null), "paralegal");
});

test("a run that filtered down to nothing holds no tab stop", () => {
  assert.equal(rovingChipId([], "paralegal", null), null);
  assert.equal(rovingChipId([{ id: "own", options: [] }], null, null), null);
});

test("the chip the arrows moved to takes the tab stop with it", () => {
  // Leaving and returning by Tab must land where the arrows left off; a stop
  // pinned to the pick sends the user back to the start of the question.
  assert.equal(rovingChipId(SECTIONS, "writer", "researcher"), "researcher");
  assert.equal(
    rovingChipId(SECTIONS, null, "case_summarizer"),
    "case_summarizer",
  );
});

test("a query that filters the arrowed chip away falls back to the pick", () => {
  assert.equal(rovingChipId(SECTIONS, "writer", "falconer"), "writer");
  assert.equal(rovingChipId(SECTIONS, null, "falconer"), "paralegal");
});
