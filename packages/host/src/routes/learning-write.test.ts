import { loadLearnings, saveActivities, saveLearnings } from "@houston/domain";
import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { appendLearningChecked } from "./learning-write";

const ROOT = "Personal/Helper";

test("appendLearningChecked stamps provenance and keeps existing learnings", async () => {
  const vfs = new MemoryVfs();
  await saveLearnings(vfs, ROOT, [
    { id: "old", text: "Existing", created_at: "2020-01-01T00:00:00.000Z" },
  ]);
  await saveActivities(vfs, ROOT, [
    {
      id: "mission-1",
      title: "Renewals",
      description: "",
      status: "running",
      session_key: "conversation-1",
    },
  ]);

  const result = await appendLearningChecked(vfs, ROOT, {
    id: "new",
    text: "  Renewals happen on Mondays.  ",
    nowIso: "2026-08-27T12:00:00.000Z",
    taughtBy: { user_id: "user-1", name: "Ada" },
    conversationId: "conversation-1",
  });

  expect(result).toMatchObject({
    learning: {
      id: "new",
      text: "Renewals happen on Mondays.",
      taught_by: { user_id: "user-1", name: "Ada" },
      mission_id: "mission-1",
      mission_title: "Renewals",
    },
  });
  expect((await loadLearnings(vfs, ROOT)).items.map((item) => item.id)).toEqual(
    ["old", "new"],
  );
});

test("appendLearningChecked deduplicates a retried append by id", async () => {
  const vfs = new MemoryVfs();
  const input = {
    id: "stable",
    text: "Keep this once",
    nowIso: "2026-08-27T12:00:00.000Z",
  };
  await appendLearningChecked(vfs, ROOT, input);
  await appendLearningChecked(vfs, ROOT, input);
  expect((await loadLearnings(vfs, ROOT)).items).toHaveLength(1);
});

test("appendLearningChecked rejects empty text without writing", async () => {
  const vfs = new MemoryVfs();
  expect(
    await appendLearningChecked(vfs, ROOT, {
      id: "new",
      text: "  ",
      nowIso: "2026-08-27T12:00:00.000Z",
    }),
  ).toEqual({ error: "missing 'text'" });
  expect((await loadLearnings(vfs, ROOT)).items).toEqual([]);
});
