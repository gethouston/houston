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
