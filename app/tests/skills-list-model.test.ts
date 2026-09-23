import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveSkillsListState,
  skillsListShowsRows,
} from "../src/components/skills-view/skills-list-model.ts";

describe("resolveSkillsListState", () => {
  it("renders rows whenever the query keeps at least one", () => {
    strictEqual(resolveSkillsListState({ total: 4, matched: 4 }), "rows");
    strictEqual(resolveSkillsListState({ total: 4, matched: 1 }), "rows");
  });

  it("calls an empty workspace empty, never a failed search", () => {
    strictEqual(resolveSkillsListState({ total: 0, matched: 0 }), "no-skills");
  });

  it("blames the query only when there were skills to narrow", () => {
    strictEqual(resolveSkillsListState({ total: 7, matched: 0 }), "no-matches");
  });
});

describe("skillsListShowsRows", () => {
  it("is false for the count an empty list would be titled with", () => {
    strictEqual(skillsListShowsRows(0), false);
  });

  it("is true as soon as one row survives the query", () => {
    strictEqual(skillsListShowsRows(1), true);
    strictEqual(skillsListShowsRows(12), true);
  });

  it("is the same rule the list state answers with", () => {
    for (const [total, matched] of [
      [0, 0],
      [7, 0],
      [7, 1],
      [7, 7],
    ] as const)
      strictEqual(
        skillsListShowsRows(matched),
        resolveSkillsListState({ total, matched }) === "rows",
        `total ${total}, matched ${matched}`,
      );
  });
});
