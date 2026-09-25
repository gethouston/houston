import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  emailAsk,
  emailTask,
} from "../src/lib/academy/email-lesson/email-task.ts";
import { createSliceCoverage } from "../src/lib/all-conversations-coverage.ts";
import type { RawConversation } from "../src/lib/tauri.ts";

// The user sends the lesson's request as an ordinary task, so the lesson finds
// that task as the sender's one it did not know about when it asked.

const row = (
  id: string,
  agentPath: string,
  updatedAt?: string,
): RawConversation => ({
  id,
  title: id,
  type: "activity",
  session_key: `activity-${id}`,
  agent_path: agentPath,
  agent_name: agentPath,
  updated_at: updatedAt,
});

/** A board where every slice was read this session. */
const allRead = () => {
  const coverage = createSliceCoverage();
  coverage.noteRead(["/ada", "/bob"]);
  return coverage;
};

describe("the email lesson's task", () => {
  const before = [row("a1", "/ada"), row("b1", "/bob")];
  const noted = (rows: readonly RawConversation[]) => {
    const ask = emailAsk(rows, "/ada", allRead());
    if (ask === null) throw new Error("the sender's tasks were not noted");
    return ask;
  };

  it("notes only the sender's tasks", () => {
    const ask = noted(before);
    strictEqual(ask.agentPath, "/ada");
    deepStrictEqual([...ask.knownTaskIds], ["a1"]);
  });

  it("is nothing until the sender has a task it did not have", () => {
    const ask = noted(before);
    strictEqual(emailTask(before, ask), null);
    strictEqual(emailTask([...before, row("b2", "/bob")], ask), null);
  });

  it("is the sender's new task", () => {
    const ask = noted(before);
    strictEqual(emailTask([...before, row("a2", "/ada")], ask)?.id, "a2");
  });

  it("is the most recently updated one when the sender gained several", () => {
    const ask = noted(before);
    const after = [
      ...before,
      row("a2", "/ada", "2026-09-24T10:00:00.000Z"),
      row("a3", "/ada", "2026-09-24T10:05:00.000Z"),
    ];
    strictEqual(emailTask(after, ask)?.id, "a3");
  });

  it("takes no note from a slice this session never read", () => {
    // The sender's read failed, so the board still shows what it last knew
    // (here: nothing). Noted now, the old tasks a later sweep fills in would
    // each look like the one the user just sent.
    const coverage = createSliceCoverage();
    coverage.noteRead(["/bob"]);
    strictEqual(emailAsk([row("b1", "/bob")], "/ada", coverage), null);
  });
});
