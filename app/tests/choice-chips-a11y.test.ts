import assert from "node:assert/strict";
import test from "node:test";
import { choiceQuestionAria } from "../src/components/shell/choice-chips-model.ts";
import type { ChoiceSection } from "../src/components/shell/choice-step-model.ts";

/**
 * One question has ONE answer, so it is announced as ONE radio group however
 * many labelled runs it is drawn in. `choice-runs.tsx` renders exactly what
 * this model returns — the group's attributes once, and a role per run
 * heading — so counting the roles here counts what reaches the screen reader.
 */
const RUNS: ChoiceSection[] = [
  {
    id: "own",
    label: "Legal jobs",
    options: [{ id: "paralegal", label: "P" }],
  },
  { id: "more", label: "More roles", options: [{ id: "writer", label: "W" }] },
  { id: "other", label: "Other jobs", options: [{ id: "editor", label: "E" }] },
];

function rolesOf(runs: readonly ChoiceSection[], hint?: string): string[] {
  const aria = choiceQuestionAria("What job?", runs, {
    id: "hint-1",
    text: hint,
  });
  return [aria.group.role, ...aria.headings.map((heading) => heading.role)];
}

test("a question drawn in several runs is still one radio group", () => {
  assert.equal(rolesOf(RUNS).filter((role) => role === "radiogroup").length, 1);
});

test("a run's heading is read as text, never as a group of its own", () => {
  const aria = choiceQuestionAria("What job?", RUNS, { id: "hint-1" });
  assert.equal(aria.headings.length, RUNS.length);
  for (const heading of aria.headings) {
    assert.equal(heading.role, "presentation");
  }
});

test("a single unlabelled run is the same one group", () => {
  assert.deepEqual(rolesOf([{ id: "own", options: [] }]), [
    "radiogroup",
    "presentation",
  ]);
});

test("the group is named for the question every run answers", () => {
  const aria = choiceQuestionAria("What job?", RUNS, { id: "hint-1" });
  assert.equal(aria.group["aria-label"], "What job?");
});

test("the arrow-key hint is described once, for the whole question", () => {
  const aria = choiceQuestionAria("What job?", RUNS, {
    id: "hint-1",
    text: "Use the arrow keys",
  });
  assert.equal(aria.group["aria-describedby"], "hint-1");
});

test("a question with no hint describes nothing at all", () => {
  const aria = choiceQuestionAria("What job?", RUNS, { id: "hint-1" });
  assert.equal(aria.group["aria-describedby"], undefined);
});
