import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  HOUSTON_WORKFLOW_MARKER,
  parseHoustonSkillWorkflow,
} from "./skill-workflow";
import { parseSkillMd } from "./skills";

const marked = (body: string) =>
  `## Steps\n${HOUSTON_WORKFLOW_MARKER}\n${body}`;
const steps = (body: string) =>
  parseHoustonSkillWorkflow(marked(body))?.steps ?? [];

test("a bold lead is the title, with or without a separator after it", () => {
  expect(
    steps(
      [
        "1. **Read the playbook.** Load the sales context. If missing, warn and continue.",
        "2. **Draft the brief** - one page, no jargon.",
        "3. **Send it**",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Read the playbook",
      detail: "Load the sales context. If missing, warn and continue.",
      integration: null,
    },
    {
      title: "Draft the brief",
      detail: "one page, no jargon.",
      integration: null,
    },
    { title: "Send it", detail: null, integration: null },
  ]);
});

test("never splits a title on a hyphen or colon inside a word or a path", () => {
  expect(
    steps(
      [
        "1. Open config/sales-context.md and read the top-level goals",
        "2. Check https://example.com/pricing for the current plan",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Open config/sales-context.md and read the top-level goals",
      detail: null,
      integration: null,
    },
    {
      title: "Check https://example.com/pricing for the current plan",
      detail: null,
      integration: null,
    },
  ]);
});

test("splits an unbolded step on a spaced separator only", () => {
  expect(steps("1. Send the recap  -  one paragraph, no attachments.")).toEqual(
    [
      {
        title: "Send the recap",
        detail: "one paragraph, no attachments.",
        integration: null,
      },
    ],
  );
  expect(steps("1. Strip noise prefixes: POS DEBIT, CHECKCARD, ACH")).toEqual([
    {
      title: "Strip noise prefixes",
      detail: "POS DEBIT, CHECKCARD, ACH",
      integration: null,
    },
  ]);
});

test("continuation lines and nested substeps become the detail", () => {
  expect(
    steps(
      [
        "1. **Collect the inputs.**",
        "   - The period to close.",
        "   - The chart of accounts.",
        "",
        "   1. Load the ledger first.",
        "2. **Close it**",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Collect the inputs",
      detail:
        "• The period to close.\n• The chart of accounts.\n1. Load the ledger first.",
      integration: null,
    },
    { title: "Close it", detail: null, integration: null },
  ]);
});

test("stops at the next top-level heading and drops inline markdown", () => {
  expect(
    steps(
      [
        "1. **Read `config/voice.md`** for the tone.",
        "",
        "## Outputs",
        "2. Not a step.",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Read config/voice.md",
      detail: "for the tone.",
      integration: null,
    },
  ]);
});

test("keeps a heading that lives inside a fenced block out of the section", () => {
  expect(
    steps(
      [
        "1. **Draft the email.**",
        "",
        "```markdown",
        "## Email 1 (Day 0)",
        "Subject: hello",
        "```",
        "",
        "2. **Send it.** After approval.",
      ].join("\n"),
    ),
  ).toEqual([
    { title: "Draft the email", detail: null, integration: null },
    { title: "Send it", detail: "After approval.", integration: null },
  ]);
});

test("falls back to subheadings when the section carries no ordered list", () => {
  expect(
    steps(
      [
        "### Step 1: Gather inputs",
        "",
        "Ask once, capture in the run notes.",
        "",
        "### Step 2 - Draft the opener",
        "",
        "Three sentences plus a PS.",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Gather inputs",
      detail: "Ask once, capture in the run notes.",
      integration: null,
    },
    {
      title: "Draft the opener",
      detail: "Three sentences plus a PS.",
      integration: null,
    },
  ]);
});

test("group subheadings never become steps of an ordered list", () => {
  expect(
    steps(
      [
        "### Shared steps",
        "1. **Read the context.**",
        "#### `ab-test`",
        "2. **Run it.**",
      ].join("\n"),
    ),
  ).toEqual([
    { title: "Read the context", detail: null, integration: null },
    { title: "Run it", detail: null, integration: null },
  ]);
});

test("moves a too-long title's tail into the detail at a clause boundary", () => {
  const [step] = steps(
    "1. **Draft every pending standard journal entry for the period (loop draft-a-journal-entry)** in order.",
  );
  expect(step?.title).toBe(
    "Draft every pending standard journal entry for the period",
  );
  expect(step?.detail).toBe("(loop draft-a-journal-entry) in order.");
  const [sentence] = steps(
    "1. I pick the source. I ask ONE pointed question when it is not obvious, with a modality hint:",
  );
  expect(sentence?.title).toBe("I pick the source");
  // The trailing colon goes with the title cleanup that ran before the cut.
  expect(sentence?.detail).toBe(
    "I ask ONE pointed question when it is not obvious, with a modality hint",
  );
});

test("a tag after the bold title names the step's connected app", () => {
  expect(
    steps(
      [
        "1. **Send the digest** [gmail:GMAIL_SEND_EMAIL] - Email the summary to the owner.",
        "2. **Read the sheet** [googlesheets] - Open the tracker and pull this week's rows.",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Send the digest",
      detail: "Email the summary to the owner.",
      integration: { toolkit: "gmail", action: "GMAIL_SEND_EMAIL" },
    },
    {
      title: "Read the sheet",
      detail: "Open the tracker and pull this week's rows.",
      integration: { toolkit: "googlesheets", action: null },
    },
  ]);
});

test("a tag's toolkit reads lowercase and its action uppercase", () => {
  expect(steps("1. **Post it** [Slack:slack_send_message]")).toEqual([
    {
      title: "Post it",
      detail: null,
      integration: { toolkit: "slack", action: "SLACK_SEND_MESSAGE" },
    },
  ]);
});

test("a malformed tag stays literal text and taints no step", () => {
  expect(
    steps(
      [
        "1. **Send it** [Gmail Send] - Now.",
        "2. **Report it** [2024] - Last year only.",
        "3. **Read it** [gmail:] - Later.",
        "4. **Skip it** [:GMAIL_SEND_EMAIL] - Never.",
      ].join("\n"),
    ),
  ).toEqual([
    { title: "Send it", detail: "[Gmail Send] - Now.", integration: null },
    {
      title: "Report it",
      detail: "[2024] - Last year only.",
      integration: null,
    },
    { title: "Read it", detail: "[gmail:] - Later.", integration: null },
    {
      title: "Skip it",
      detail: "[:GMAIL_SEND_EMAIL] - Never.",
      integration: null,
    },
  ]);
});

test("a tag anywhere but right after the bold title is plain text", () => {
  expect(
    steps(
      [
        "1. **Draft the note** - Send it with [gmail] once approved.",
        "2. Send the recap [gmail] - One paragraph.",
      ].join("\n"),
    ),
  ).toEqual([
    {
      title: "Draft the note",
      detail: "Send it with [gmail] once approved.",
      integration: null,
    },
    {
      title: "Send the recap [gmail]",
      detail: "One paragraph.",
      integration: null,
    },
  ]);
});

test("only the first tag counts; a second one is text", () => {
  expect(steps("1. **Sync them** [gmail] [slack] - Both apps.")).toEqual([
    {
      title: "Sync them",
      detail: "[slack] - Both apps.",
      integration: { toolkit: "gmail", action: null },
    },
  ]);
});

test("no workflow without the marker", () => {
  expect(parseHoustonSkillWorkflow("1. **Do it.** Now.")).toBeNull();
  expect(parseHoustonSkillWorkflow(marked("Just prose, no steps."))).toBeNull();
});

const STORE = fileURLToPath(new URL("../../../store", import.meta.url));

function skillFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) skillFiles(path, out);
    else if (entry.name === "SKILL.md") out.push(path);
  }
  return out;
}

// The bundled catalog is the parser's real corpus: 350+ hand-written skills in
// three languages. Every one of them must render as steps a person can read —
// a regression here ships garbled titles into the app's built-in agents.
test("every bundled Houston skill parses into readable steps", () => {
  // The catalog is committed, so an absent directory is a broken checkout, not
  // an optional extra: say so loudly rather than reporting green on no corpus.
  expect(existsSync(STORE), `bundled skill catalog missing: ${STORE}`).toBe(
    true,
  );
  const files = skillFiles(STORE).filter((file) =>
    readFileSync(file, "utf8").includes(HOUSTON_WORKFLOW_MARKER),
  );
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const slug = file.split("/").at(-2) ?? file;
    const parsed = parseSkillMd(slug, readFileSync(file, "utf8"));
    if ("error" in parsed) throw new Error(`${file}: ${parsed.error}`);
    const workflow = parsed.workflow;
    if (!workflow) throw new Error(`${file}: no workflow parsed`);
    for (const step of workflow.steps) {
      const where = `${file} -> ${JSON.stringify(step.title)}`;
      expect(step.title.length, where).toBeGreaterThanOrEqual(2);
      expect(step.title.length, where).toBeLessThanOrEqual(80);
      expect(step.title, where).not.toMatch(/[\n`]|\*\*/);
      // The bundled skills carry no app tags: nothing in the catalog may be
      // read as one by accident.
      expect(step.integration, where).toBeNull();
      if (step.detail !== null)
        expect(step.detail, where).not.toMatch(/^\s*[-–—:,;]/);
    }
  }
});
