import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTurnSummaryItems,
  groupTurnSummaryItems,
} from "./turn-summary-items.ts";

const agentPath = "/Users/me/Houston/Agent";

test("summarizes internal agent files as semantic updates", () => {
  const items = buildTurnSummaryItems(
    [
      {
        name: "Write",
        input: { file_path: `${agentPath}/CLAUDE.md` },
        result: { content: "ok", is_error: false },
      },
      {
        name: "Edit",
        input: { file_path: `${agentPath}/.agents/skills/report/SKILL.md` },
        result: { content: "ok", is_error: false },
      },
      {
        name: "Write",
        input: { file_path: `${agentPath}/.houston/learnings/learnings.json` },
        result: { content: "ok", is_error: false },
      },
    ],
    agentPath,
  );

  assert.deepEqual(items, [
    { kind: "semantic", update: "instructions" },
    { kind: "semantic", update: "skills" },
    { kind: "semantic", update: "learnings" },
  ]);
});

test("keeps normal files in the summary", () => {
  const items = buildTurnSummaryItems(
    [
      {
        name: "Write",
        input: { file_path: `${agentPath}/deck.pptx` },
        result: { content: "ok", is_error: false },
      },
    ],
    agentPath,
  );

  assert.deepEqual(items, [
    { kind: "file", path: `${agentPath}/deck.pptx`, change: "created" },
  ]);
});

test("puts edited files under updates", () => {
  const items = buildTurnSummaryItems(
    [
      {
        name: "Edit",
        input: { file_path: `${agentPath}/brief.txt` },
        result: { content: "ok", is_error: false },
      },
    ],
    agentPath,
  );

  assert.deepEqual(items, [
    { kind: "file", path: `${agentPath}/brief.txt`, change: "modified" },
  ]);
});

test("extracts labeled bash output paths", () => {
  const items = buildTurnSummaryItems(
    [
      {
        name: "Bash",
        input: { command: "python make_deck.py" },
        result: {
          content: `Saved: ${agentPath}/presentation.pptx\nDone`,
          is_error: false,
        },
      },
    ],
    agentPath,
  );

  assert.deepEqual(items, [
    { kind: "file", path: `${agentPath}/presentation.pptx`, change: "created" },
  ]);
});

test("uses session file changes and ignores python helpers", () => {
  const items = buildTurnSummaryItems(
    [
      {
        name: "Write",
        input: { file_path: `${agentPath}/make_deck.py` },
        result: { content: "ok", is_error: false },
      },
    ],
    agentPath,
    [
      { path: `${agentPath}/make_deck.py`, status: "created" },
      { path: `${agentPath}/presentation.pptx`, status: "created" },
      { path: `${agentPath}/notes.txt`, status: "modified" },
    ],
  );

  assert.deepEqual(items, [
    { kind: "file", path: `${agentPath}/presentation.pptx`, change: "created" },
    { kind: "file", path: `${agentPath}/notes.txt`, change: "modified" },
  ]);
});

test("groups semantic updates and files separately", () => {
  const groups = groupTurnSummaryItems([
    { kind: "semantic", update: "skills" },
    { kind: "file", path: `${agentPath}/deck.pptx`, change: "created" },
    { kind: "file", path: `${agentPath}/notes.txt`, change: "modified" },
  ]);

  assert.deepEqual(groups.updates, [
    { kind: "semantic", update: "skills" },
    { kind: "file", path: `${agentPath}/notes.txt`, change: "modified" },
  ]);
  assert.deepEqual(groups.files, [
    { kind: "file", path: `${agentPath}/deck.pptx`, change: "created" },
  ]);
});
