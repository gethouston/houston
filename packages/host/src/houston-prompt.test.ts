import { expect, test } from "bun:test";
import { houstonSystemPrompt } from "./houston-prompt";

/**
 * Faithful port of the Rust product prompt — mirrors the assertions in
 * app/src-tauri/src/houston_prompt/mod.rs so the agent's behavior matches the
 * desktop. The key bit for QA: it tells the agent HOW to create routines/skills.
 */
test("the prompt carries the interaction gates + Houston context", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("# Houston Context");
  expect(p).toContain("# Interaction Procedure");
  expect(p).toContain("# Load Relevant Guidance");
  expect(p).toContain("Classify the request");
  expect(p).toContain("Routine request");
  expect(p).toContain(
    "Ask for explicit approval before work that will change persistent user data",
  );
});

test("routine guidance maps recurring requests to routines + names the file", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("## How-To Guidance: Routines");
  expect(p).toContain('explicitly says "routine"');
  expect(p).toContain(
    "Ask for approval before creating, enabling, or changing a Routine",
  );
  // The actionable bit the agent was missing: where routines are persisted.
  expect(p).toContain(".houston/routines/routines.json");
});

test("skill guidance uses the current SKILL.md layout and omits legacy fields", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(".agents/skills/<skill-name>/SKILL.md");
  expect(p).toContain("## Procedure");
  expect(p).not.toContain("tags:");
  expect(p).not.toContain("inputs");
  expect(p).not.toContain("prompt_template");
});

test("memory guidance requires explicit opt-in", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("Want me to remember that for next time?");
  expect(p).toContain("Save a learning only when");
  expect(p).toContain(".houston/learnings/learnings.json");
});

test("Composio is dropped (cut in the convergence)", () => {
  expect(houstonSystemPrompt()).not.toContain("Composio");
});
