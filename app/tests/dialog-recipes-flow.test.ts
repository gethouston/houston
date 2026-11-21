import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "../src");

const AREAS = [
  "components/copy-agent",
  "components/employee-card",
  "components/portable",
  "components/context/job-brief-picker.tsx",
  "components/context/job-brief-question.tsx",
  ...[
    "add-choice-step",
    "add-to-workspace-sheet",
    "agent-identity-form",
    "choice-chips",
    "choice-row",
    "choice-runs",
    "choice-step",
    "choose-start-step",
    "context-step",
    "create-flow-footer",
    "create-flow-step-view",
    "create-step-progress",
    "create-team-step",
    "customize-step",
    "naming-step",
    "role-step",
  ].map((name) => `components/shell/${name}.tsx`),
];

function filesIn(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full)
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => join(full, entry));
}

const FILES = AREAS.flatMap(filesIn);

function allSources(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allSources(full, into);
    else if (/\.tsx?$/.test(entry.name)) into.push(full);
  }
  return into;
}

describe("the flow surfaces wear the FlowSheet recipe", () => {
  it("covers every file of every flow area", () => {
    assert.ok(FILES.length >= 20, `only ${FILES.length} flow files found`);
  });

  it("never reaches past the recipe to a dialog of its own", () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      for (const banned of ["DialogContent", "DialogHeader", "DialogFooter"]) {
        assert.ok(
          !source.includes(banned),
          `${file} assembles its own dialog (${banned})`,
        );
      }
    }
  });

  it("never sizes the surface it is rendered in", () => {
    for (const file of FILES) {
      const source = readFileSync(file, "utf8");
      assert.ok(!/sm:max-w-/.test(source), `${file} picks its own width`);
      assert.ok(!/\bh-\[/.test(source), `${file} picks its own height`);
      assert.ok(!/dvh/.test(source), `${file} picks its own height`);
    }
  });

  it("leaves the 900px surface behind for good", () => {
    for (const file of allSources(ROOT)) {
      assert.ok(
        !readFileSync(file, "utf8").includes("max-w-[900px]"),
        `${file} brings back the 900px sheet`,
      );
    }
  });
});
