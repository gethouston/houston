import { expect, test } from "vitest";
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

test("integrations guidance teaches the tools + the request_connection card", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("## How-To Guidance: Connected Apps (Integrations)");
  expect(p).toContain("integration_search");
  expect(p).toContain("integration_execute");
  expect(p).toContain("request_connection");
  expect(p).toContain("I've connected Gmail. Please continue.");
  // The markdown-link connect hack is gone; the connect card is a tool now.
  expect(p).not.toContain("houston_toolkit");
  expect(p).not.toContain("markdown link");
});

test("blocking questions, choices, and approvals route through the ask_user tool", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("ask_user");
  expect(p).toContain("never leave a question sitting in plain text");
  expect(p).toContain(
    "Always request that approval through the `ask_user` tool",
  );
  // The learn-preferences opt-in is a blocking yes/no too: it must not sit in
  // plain text, it has to route through ask_user like every other question.
  expect(p).not.toMatch(/ask: "Want me to remember/);
});

test("the prompt tells the agent to batch questions into one ask_user call", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("up to 3 questions");
  expect(p).toContain("never one question per turn");
  expect(p).toContain("Three is a cap, not a target");
  // The old one-question-per-turn drip is gone.
  expect(p).not.toContain("one thing at a time");
  expect(p).not.toContain("one question at a time");
});

test("a task needing answers AND a connection uses both tools in one turn (email example)", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(
    "call `ask_user` and `request_connection` in the SAME turn",
  );
  expect(p).toContain("one card the user completes step by step");
  // The email example the sequence was designed around.
  expect(p).toContain("to send an email you were asked to send");
});

test("the guidance is provider-agnostic and CLI-free (Composio CLI cut in the convergence)", () => {
  const p = houstonSystemPrompt();
  expect(p).not.toContain("Composio");
  expect(p).not.toContain("composio link");
});
