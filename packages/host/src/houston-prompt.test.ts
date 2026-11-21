import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { houstonSystemPrompt } from "./houston-prompt";

test("the prompt carries the interaction gates + Houston context", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("# Houston Context");
  expect(p).toContain("# Interaction Procedure");
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
  expect(p).toContain("save_routine");
  expect(p).toContain("NEVER write, edit, or run a command that changes");
  expect(p).toContain(".houston/routines/routines.json");
});

test("missions guidance teaches the start/review/move loop (PRODUCT-1244)", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("## How-To Guidance: Missions");
  expect(p).toContain("start_mission");
  expect(p).toContain("list_missions");
  expect(p).toContain("read_mission");
  expect(p).toContain("update_mission_status");
  expect(p).toContain("cannot see this conversation");
  expect(p).toContain("cannot start further missions");
  expect(p).toContain("the mission this chat belongs to");
});

test("skill guidance uses the current SKILL.md layout and omits legacy fields", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(".agents/skills/<skill-name>/SKILL.md");
  expect(p).toContain("## Workflow");
  expect(p).toContain("<!-- houston-workflow:v1 -->");
  expect(p).toContain("created_by: houston");
  expect(p).not.toContain("find_skills");
  expect(p).not.toContain("tags:");
  expect(p).not.toContain("inputs");
  expect(p).not.toContain("prompt_template");
});

test("instructions guidance teaches the job description's frontmatter block", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("### Instructions (Self-Editing)");
  expect(p).toContain("Your own instructions live in `CLAUDE.md`");
  expect(p).toContain("`industry` and `role`");
  expect(p).toContain("industry: Healthcare\nrole: Medical coder");
  expect(p).toContain(
    "keep it intact and at the top every time you write the file",
  );
  expect(p).toContain(
    "When the user tells you their industry or their role changed, update those two lines to match.",
  );
});

test("memory guidance requires explicit opt-in via the reflection step", () => {
  const p = houstonSystemPrompt();
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
  expect(p).not.toContain("houston_toolkit");
  expect(p).not.toContain("markdown link");
});

function norm(s: string): string {
  return s
    .replace(/\\\r?\n[ \t]*/g, "")
    .replace(/\\n/g, "")
    .replace(/\\"/g, '"')
    .replace(/\s+/g, "");
}

test("the new blocked speech act lands in BOTH the TS prompt and the Rust mirror", () => {
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
    "switched on in this agent's Settings, under Apps",
    "NEVER call `request_connection` for a blocked app",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
  expect(ts).not.toContain(norm("their admin needs to enable"));
  expect(rs).not.toContain(norm("their admin needs to enable"));
});

test("app-action confirmation is a pre-ask ask_user question (no post-turn card)", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(
    "Before any app action that changes something or reaches other people",
  );
  expect(p).toContain("ONE `ask_user` question in the SAME turn");
  expect(p).toContain("Should I send the 30 invites?");
  expect(p).toContain("Never confirm read-only actions");
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
  expect(rs).not.toContain(
    norm("Houston shows the user ONE confirmation card"),
  );
  expect(ts).not.toContain(
    norm("Houston shows the user ONE confirmation card"),
  );
});

test("suggest_actions is MANDATORY on every non-blocking finish, in BOTH mirrors", () => {
  const rust = readFileSync(
    fileURLToPath(
      new URL(
        "../../../app/src-tauri/src/houston_prompt/base.rs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const ts = norm(houstonSystemPrompt());
  const rs = norm(rust);
  for (const phrase of [
    "Finish every non-blocking turn with `suggest_actions`.",
    "This is mandatory: the user must always leave your turn with something to do next.",
    "Blocking turns are the only exception",
    "2 to 4 follow-ups grounded in what you just did",
    "That call ends your turn: write the whole closing message before it and nothing after it.",
    "Ending with no follow-ups is not an option.",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
  expect(ts).not.toContain(norm("Skip the call only when"));
  expect(rs).not.toContain(norm("Skip the call only when"));
});

test("a needed file is asked for through ask_user, whose own schema carries wantsFiles", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(
    "Whenever you need something from the user (an answer, a choice, a file, or a go-ahead), ask through the `ask_user` tool",
  );
  expect(p).not.toContain("+ button");
});

test("blocking questions, choices, and approvals route through the ask_user tool", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("ask_user");
  expect(p).toContain("Never leave a question sitting in plain text");
  expect(p).toContain(
    "Always request that approval through the `ask_user` tool",
  );
  expect(p).not.toMatch(/ask: "Want me to remember/);
});

test("the prompt tells the agent to batch questions into one ask_user call", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain("batching everything you need into that one call");
  expect(p).not.toContain("one thing at a time");
  expect(p).not.toContain("one question at a time");
});

test("a task needing answers AND a connection uses both tools in one turn (email example)", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(
    "call `ask_user` and `request_connection` in the SAME turn",
  );
  expect(p).toContain("one card the user completes step by step");
  expect(p).toContain("to send an email you were asked to send");
});

test("the guidance is provider-agnostic and CLI-free (Composio CLI cut in the convergence)", () => {
  const p = houstonSystemPrompt();
  expect(p).not.toContain("Composio");
  expect(p).not.toContain("composio link");
});

test("event wakes are advertised only where a trigger backend can fire them", () => {
  const withTriggers = houstonSystemPrompt({ triggers: true });
  expect(withTriggers).toContain("## How-To Guidance: Routines");
  expect(withTriggers).toContain("save_routine");
  expect(withTriggers).toContain(".houston/routines/routines.json");
  expect(withTriggers).toContain("on an EVENT in a connected app");
  expect(withTriggers).toContain("a `schedule` or a `trigger`, never both");

  const scheduleOnly = houstonSystemPrompt({ triggers: false });
  expect(scheduleOnly).toContain("## How-To Guidance: Routines");
  expect(scheduleOnly).toContain("save_routine");
  expect(scheduleOnly).toContain(".houston/routines/routines.json");
  expect(scheduleOnly).not.toContain("on an EVENT in a connected app");
  expect(scheduleOnly).not.toContain("`trigger`");
  expect(scheduleOnly).toContain("need Houston Cloud");
  expect(scheduleOnly).not.toContain("Composio");
});

test("the default prompt is schedule-only (the built-in default serves desktop/self-host)", () => {
  expect(houstonSystemPrompt()).toBe(houstonSystemPrompt({ triggers: false }));
});

test("the prompt keeps task work in the workspace, never /tmp, in BOTH mirrors (PRODUCT-1784)", () => {
  const rust = readFileSync(
    fileURLToPath(
      new URL(
        "../../../app/src-tauri/src/houston_prompt/base.rs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const ts = norm(houstonSystemPrompt());
  const rs = norm(rust);
  for (const phrase of [
    "Your workspace is the only place that survives a restart or a move to another machine.",
    "Never build under `/tmp`.",
    "keep the exact install steps in a small setup script inside the project folder",
    "When the task is delivered, remove what the user did not ask for",
    "After a restart, check what is actually on disk before redoing anything.",
    "Tell the user in plain words what survived and what you are redoing before you start over.",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
});

test("every agent learns the AI Manager is Houston, in BOTH mirrors", () => {
  const rust = ["base.rs", "integrations.rs", "routines.rs", "skills_memory.rs"]
    .map((file) =>
      readFileSync(
        fileURLToPath(
          new URL(
            `../../../app/src-tauri/src/houston_prompt/${file}`,
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    )
    .join("\n");
  const ts = norm(houstonSystemPrompt({ triggers: true }));
  const rs = norm(rust);
  for (const phrase of [
    "The user's AI Manager is named Houston: it runs their team of AI Employees.",
    'When the user says "Houston", they may mean the app or their AI Manager.',
    "unless your instructions say you are the AI Manager, never introduce yourself as Houston.",
  ]) {
    const needle = norm(phrase);
    expect(ts).toContain(needle);
    expect(rs).toContain(needle);
  }
  for (const prompt of [ts, rs])
    expect(prompt).not.toMatch(
      /Houston(shows|detects|combines|messages|records|attaches|asks|runs|reports|says)/,
    );
});

test("a turn that needs tools opens with one plain sentence, in BOTH mirrors (PRODUCT-1979)", () => {
  const rust = readFileSync(
    fileURLToPath(
      new URL(
        "../../../app/src-tauri/src/houston_prompt/base.rs",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  const bullet = norm(
    '- When a turn needs work tools (looking something up, reading files, running something, acting on an app), first write one short sentence saying in plain words what you are about to do, for example "Let me check your inbox for that invoice." Once per turn, with no file names, commands, or tool names. Skip it when you answer without work tools, when the user asked for only a bare answer, and before `ask_user`, `request_connection`, `request_credential`, <next_step_suggestions>`suggest_actions`, </next_step_suggestions>or `suggest_reusable`.',
  );
  expect(norm(houstonSystemPrompt())).toContain(bullet);
  expect(norm(rust)).toContain(bullet);
});

test("account choice is taught by the search result, not restated in the prompt", () => {
  const p = houstonSystemPrompt();
  expect(p).toContain(
    "When an app has several connected accounts, the search result lists them and says how to choose.",
  );
  expect(p).not.toContain("Never guess which account is work or personal");
});
