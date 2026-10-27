import assert from "node:assert/strict";
import { it } from "node:test";
import type { Activity } from "../src/data/activity.ts";
import { activityWrites } from "../src/data/activity-writes.ts";

it("whole-file board writes preserve the last message during rename, drag, archive and pin clear", async () => {
  let content =
    '[{"id":"m1","title":"Draft","description":"","status":"needs_you","provider":"anthropic","model":"sonnet","last_message_at":"2026-10-26T10:00:00.000Z"}]';
  const writes = activityWrites({
    list: async () => JSON.parse(content),
    write: async (_path, items) => {
      content = JSON.stringify(items);
    },
    now: () => "2026-10-27T17:00:00.000Z",
    newId: () => "new-id",
  });
  for (const patch of [
    { title: "Renamed" },
    { status: "done" },
    { status: "archived" },
    { provider: null, model: null },
  ]) {
    await writes.update("agent", "m1", patch);
    const rows: Activity[] = JSON.parse(content);
    assert.equal(rows[0]?.last_message_at, "2026-10-26T10:00:00.000Z");
    assert.equal(rows[0]?.updated_at, "2026-10-27T17:00:00.000Z");
  }
  await writes.bulkUpdate("agent", ["m1"], { status: "done" });
  assert.deepEqual(JSON.parse(content), [
    {
      id: "m1",
      title: "Renamed",
      description: "",
      status: "done",
      last_message_at: "2026-10-26T10:00:00.000Z",
      updated_at: "2026-10-27T17:00:00.000Z",
    },
  ]);
});

for (const bulk of [false, true]) {
  it(`backfills a legacy card before a ${bulk ? "bulk" : "single"} drag changes updated_at`, async () => {
    let rows: Activity[] = [
      {
        id: "old",
        title: "Old",
        description: "",
        status: "needs_you",
        updated_at: "2026-10-26T10:00:00.000Z",
      },
    ];
    const writes = activityWrites({
      list: async () => rows,
      write: async (_path, items) => {
        rows = items;
      },
      now: () => "2026-10-27T17:00:00.000Z",
      newId: () => "new",
    });
    if (bulk) await writes.bulkUpdate("agent", ["old"], { status: "done" });
    else await writes.update("agent", "old", { status: "done" });
    assert.equal(rows[0]?.status, "done");
    assert.equal(rows[0]?.last_message_at, "2026-10-26T10:00:00.000Z");
    assert.equal(rows[0]?.updated_at, "2026-10-27T17:00:00.000Z");
  });
}

it("single and bulk writes anchor a card missing both timestamps to now", async () => {
  for (const bulk of [false, true]) {
    let rows: Activity[] = [
      { id: "old", title: "Old", description: "", status: "running" },
    ];
    const writes = activityWrites({
      list: async () => rows,
      write: async (_path, items) => {
        rows = items;
      },
      now: () => "2026-10-27T17:00:00.000Z",
      newId: () => "new",
    });
    if (bulk) await writes.bulkUpdate("agent", ["old"], { status: "done" });
    else await writes.update("agent", "old", { status: "done" });
    assert.equal(rows[0]?.last_message_at, "2026-10-27T17:00:00.000Z");
  }
});
