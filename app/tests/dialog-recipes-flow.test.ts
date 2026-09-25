import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The flow surfaces wear the RECIPE, never a dialog of their own.
 *
 * A multi-step flow that brings its own `DialogContent` brings its own width,
 * its own height and its own header with it, so moving between two screens of
 * the same errand shifts the frame under the user's hands. `FlowSheet`
 * (@houston-ai/core) fixes the frame; this guard is what keeps every screen
 * inside it, because a single hand-sized dialog is all it takes for the sprawl
 * to start.
 *
 * Picking a SIZE is the same defect one step earlier. `sm:max-w-…` is the
 * dialog-width spelling (DialogContent's unprefixed cap is the phone gutter),
 * and `h-[…]` / `…dvh` is a screen deciding how tall the flow should be — both
 * belong to the recipe alone. A plain `max-w-*` on a centred column inside the
 * body is something else entirely: a reading width, which is typography.
 */

const ROOT = join(import.meta.dirname, "../src");

/** Every flow surface: the create sheet and its steps (the employee card the
 *  hire is named on included), the copy wizard, the import wizard, and the
 *  job-brief question asked again after creation, in its sheet or on a card. */
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
    "sidebar-create-button",
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

/** Every `.ts`/`.tsx` under `app/src`, for the guards that must hold repo-wide. */
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
    // A guard that silently stopped matching anything would pass forever.
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
    // A 900px sheet holding a two-option question is the defect the sizes
    // exist to end; nothing in the app may reach for that width again.
    for (const file of allSources(ROOT)) {
      assert.ok(
        !readFileSync(file, "utf8").includes("max-w-[900px]"),
        `${file} brings back the 900px sheet`,
      );
    }
  });
});
