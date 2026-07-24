import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  expect(p).toContain('explicitly says "scheduled task"');
  expect(p).toContain(
    "Ask for approval before creating, enabling, or changing a Routine",
  );
  // The merge-safe save path: the agent MUST use save_routine and MUST NOT write
  // routines.json wholesale (the isolated-setup-chat overwrite bug).
  expect(p).toContain("save_routine");
  expect(p).toContain("NEVER write, edit, or run a command that changes");
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

test("memory guidance requires explicit opt-in via the reflection step", () => {
  const p = houstonSystemPrompt();
  // Inferred learnings are offered in the end-of-task reflection step (the
  // suggest_reusable card), never asked mid-task via ask_user or plain text.
  expect(p).toContain("end-of-task reflection step");
  expect(p).toContain("Reflection step:");
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

/**
 * Collapse whitespace + strip the Rust string-literal escapes (line
 * continuations `\<nl>`, literal `\n`, escaped quotes `\"`) so a phrase can be
 * matched across BOTH mirrors regardless of source wrapping/formatting.
 */
function norm(s: string): string {
  return s
    .replace(/\\\r?\n[ \t]*/g, "") // Rust line continuations
    .replace(/\\n/g, "") // literal \n escapes
    .replace(/\\"/g, '"') // escaped quotes
    .replace(/\s+/g, "");
}

test("the new blocked speech act lands in BOTH the TS prompt and the Rust mirror", () => {
  // Guards the sync contract for the CHANGED copy (byte-for-byte parity of the
  // whole file trips on a pre-existing em-dash/hyphen divergence, so pin the
  // load-bearing blocked-act strings instead): the app must be described as
  // turned off for THIS agent, fixable in the agent's Permissions tab, and the
  // request_connection ban preserved — in both the host prompt and the Rust
  // `PI_INTEGRATIONS_GUIDANCE` the desktop ships.
  const rust = readFileSync(
    fileURLToPath(
      new URL(
        "../../../app/src-tauri/src/houston_prompt/integrations.rs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const ts = norm(houstonSystemPrompt());
  const rs = norm(rust);
  for (const phrase of [
    "turned off for this agent",
    "switched on in this agent's Permissions tab",
    "NEVER call `request_connection` for a blocked app",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
  // The pre-simplification "ask your admin" framing is gone from both.
  expect(ts).not.toContain(norm("their admin needs to enable"));
  expect(rs).not.toContain(norm("their admin needs to enable"));
});

test("app-action confirmation is a pre-ask ask_user question (no post-turn card)", () => {
  const p = houstonSystemPrompt();
  // The new model: confirm a changing app action UP FRONT with one ask_user
  // question branded by the app (the question's toolkit), covering the batch.
  expect(p).toContain(
    "Before any app action that changes something or reaches other people",
  );
  expect(p).toContain("ONE `ask_user` question in the SAME turn");
  expect(p).toContain("Should I send the 30 invites?");
  // Read-only actions are never confirmed.
  expect(p).toContain("Never confirm read-only actions");
  // The retired model is gone: Houston no longer shows its own card after the
  // turn, and there is no "do not pre-ask for connected-app actions" carve-out.
  expect(p).not.toContain("Houston shows its own confirmation card");
  expect(p).not.toContain("Houston shows the user ONE confirmation card");
  expect(p).not.toContain("do not pre-ask for those");
  expect(p).not.toContain("gated by Houston's own confirmation card");
});

test("the pre-ask confirmation contract mirrors into the Rust integrations prompt", () => {
  const rust = readFileSync(
    fileURLToPath(
      new URL(
        "../../../app/src-tauri/src/houston_prompt/integrations.rs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const ts = norm(houstonSystemPrompt());
  const rs = norm(rust);
  for (const phrase of [
    "Before any app action that changes something or reaches other people",
    "set that question's `toolkit` to the app's slug",
    "When `ask_user` is unavailable (Autopilot), act directly.",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
  // The retired confirmation-card copy is gone from both mirrors.
  expect(rs).not.toContain(
    norm("Houston shows the user ONE confirmation card"),
  );
  expect(ts).not.toContain(
    norm("Houston shows the user ONE confirmation card"),
  );
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

test("event wakes are advertised only where a trigger backend can fire them", () => {
  const withTriggers = houstonSystemPrompt({ triggers: true });
  // Both variants keep the routine identity + the merge-safe save_routine path.
  expect(withTriggers).toContain("## How-To Guidance: Routines");
  expect(withTriggers).toContain("save_routine");
  expect(withTriggers).toContain(".houston/routines/routines.json");
  // The ON variant describes the event wake mechanism.
  expect(withTriggers).toContain("on an EVENT in a connected app");
  expect(withTriggers).toContain("a `schedule` or a `trigger`, never both");

  const scheduleOnly = houstonSystemPrompt({ triggers: false });
  expect(scheduleOnly).toContain("## How-To Guidance: Routines");
  expect(scheduleOnly).toContain("save_routine");
  expect(scheduleOnly).toContain(".houston/routines/routines.json");
  // The OFF variant never advertises an event wake it cannot fire, and steers
  // an event-wake request to Houston Cloud (never naming the provider).
  expect(scheduleOnly).not.toContain("on an EVENT in a connected app");
  expect(scheduleOnly).not.toContain("`trigger`");
  expect(scheduleOnly).toContain("need Houston Cloud");
  expect(scheduleOnly).not.toContain("Composio");
});

test("the default prompt is schedule-only (the built-in default serves desktop/self-host)", () => {
  expect(houstonSystemPrompt()).toBe(houstonSystemPrompt({ triggers: false }));
});
