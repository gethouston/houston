import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createHeadlineTracker,
  type HeadlineRow,
} from "../src/components/shell/mission-headline-model.ts";

const headlineOf = (rows: HeadlineRow[]) => {
  const tracker = createHeadlineTracker();
  for (const row of rows) tracker.note(row);
  return tracker.headline();
};

const row = (title: string, status: string, day: number): HeadlineRow => ({
  title,
  status,
  updated_at: `2026-09-${day}T10:00:00Z`,
});

describe("the mission a row leads with", () => {
  it("is the work in progress, even over a newer wait", () => {
    deepStrictEqual(
      headlineOf([row("Busy", "running", 20), row("Ask", "needs_you", 26)]),
      { title: "Busy", status: "running", updatedAt: "2026-09-20T10:00:00Z" },
    );
  });

  it("is the newest wait on the person when nothing is at work", () => {
    strictEqual(
      headlineOf([
        row("Old ask", "needs_you", 20),
        row("New ask", "needs_you", 21),
        row("Finished", "done", 26),
      ])?.title,
      "New ask",
    );
  });

  it("is the newest of any kind otherwise, compared as instants", () => {
    deepStrictEqual(
      headlineOf([
        {
          title: "Earlier",
          status: "done",
          updated_at: "2026-09-26T09:00:00Z",
        },
        {
          title: "Later",
          status: "queued",
          updated_at: "2026-09-26T09:00:00.500Z",
        },
      ]),
      { title: "Later", status: "idle", updatedAt: "2026-09-26T09:00:00.500Z" },
    );
  });

  it("keeps an untitled mission at work, since working is worth saying", () => {
    deepStrictEqual(headlineOf([row("", "running", 26)]), {
      title: "",
      status: "running",
      updatedAt: "2026-09-26T10:00:00Z",
    });
  });

  it("never leads with an archived, idle untitled or undated row", () => {
    strictEqual(
      headlineOf([
        row("Gone", "archived", 26),
        row("  ", "done", 26),
        { title: "Undated", status: "done" },
        { title: "Garbled", status: "done", updated_at: "not a date" },
      ]),
      null,
    );
  });
});
