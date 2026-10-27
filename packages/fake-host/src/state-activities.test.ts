import type { Activity } from "@houston/protocol";
import { expect, it } from "vitest";
import { createActivity } from "./state-activities";

/**
 * The fake host takes server-stamped keys off a seeding POST so an e2e can
 * show every board tag, but only in the shape the real host would stamp.
 */

it("seeds a mission's starter, and drops one the real host never stamps", () => {
  const houston = createActivity("seed-agent", {
    title: "t",
    started_by: "houston",
  });
  expect(houston.started_by).toBe("houston");
  // A POST body is untyped JSON: the value arrives however the caller wrote it.
  const body: Partial<Activity> = JSON.parse(
    '{"title":"t","started_by":"person"}',
  );
  const forged = createActivity("seed-agent", body);
  expect("started_by" in forged).toBe(false);
});

it("PATCH stamps from its query and preserves the stamp on ordinary writes", async () => {
  const { handleActivities } = await import("./routes-agent-data");
  const created = createActivity("message-agent", { title: "Draft" });
  const stamped = handleActivities(
    "PATCH",
    "message-agent",
    ["message-agent", "activities", created.id],
    { status: "needs_you" },
    new URLSearchParams("stamp=last_message"),
  );
  expect(await stamped.json()).toMatchObject({
    last_message_at: "2024-01-01T00:00:00.000Z",
  });
  const { writeAgentFile } = await import("./state");
  writeAgentFile(
    "message-agent",
    ".houston/activity/activity.json",
    JSON.stringify([
      { ...created, last_message_at: "2026-10-26T10:00:00.000Z" },
    ]),
  );
  const renamed = handleActivities(
    "PATCH",
    "message-agent",
    ["message-agent", "activities", created.id],
    { title: "Renamed" },
    new URLSearchParams(),
  );
  expect(await renamed.json()).toMatchObject({
    title: "Renamed",
    last_message_at: "2026-10-26T10:00:00.000Z",
  });
  const forged = handleActivities(
    "PATCH",
    "message-agent",
    ["message-agent", "activities", created.id],
    { last_message_at: "2000-01-01T00:00:00.000Z" },
    new URLSearchParams(),
  );
  expect(forged.status).toBe(400);
});

it("ignores future stamp values without refusing the PATCH", async () => {
  const { handleActivities } = await import("./routes-agent-data");
  const card = createActivity("future-stamp-agent", {
    title: "Draft",
    last_message_at: "2026-10-26T10:00:00.000Z",
  });
  const { writeAgentFile } = await import("./state");
  writeAgentFile(
    "future-stamp-agent",
    ".houston/activity/activity.json",
    JSON.stringify([{ ...card, last_message_at: "2026-10-26T10:00:00.000Z" }]),
  );
  const response = handleActivities(
    "PATCH",
    "future-stamp-agent",
    ["future-stamp-agent", "activities", card.id],
    { status: "done" },
    new URLSearchParams("stamp=future"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "done",
    last_message_at: "2026-10-26T10:00:00.000Z",
  });
});

it.each([
  ["patch", "2023-10-26T10:00:00.000Z"],
  ["dismiss", "2023-10-26T10:00:00.000Z"],
  ["patch", undefined],
  ["dismiss", undefined],
] as const)("backfills a legacy card before a non-message %s, previous time %s", async (operation, previous) => {
  const { writeAgentFile } = await import("./state");
  const { updateActivity, clearActivityInteraction, listActivities } =
    await import("./state-activities");
  const agent = `legacy-${operation}`;
  const created = createActivity(agent, { title: "Old" });
  writeAgentFile(
    agent,
    ".houston/activity/activity.json",
    JSON.stringify([
      {
        ...created,
        updated_at: previous,
        pending_interaction: {
          steps: [
            {
              kind: "suggest_actions",
              id: "s1",
              actions: [{ id: "a1", label: "Again", message: "Again" }],
            },
          ],
        },
      },
    ]),
  );
  if (operation === "patch")
    updateActivity(agent, created.id, { status: "done" });
  else clearActivityInteraction(agent, `activity-${created.id}`);
  expect(listActivities(agent)[0]).toMatchObject({
    updated_at: "2024-01-01T00:00:00.000Z",
    last_message_at: previous ?? "2024-01-01T00:00:00.000Z",
  });
});
