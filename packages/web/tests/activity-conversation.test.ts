import { expect, test } from "vitest";
import { activityToConversation } from "../src/engine-adapter/activities";

test("conversation mapping keeps the mission-card metadata (agent mode + routine)", () => {
  // Mission Control derives card tags from `agent` and `routine_id`; the
  // adapter dropping them left new-engine cards untagged (HOU-665).
  const entry = activityToConversation(
    {
      id: "act-1",
      title: "Morning digest",
      description: "Summarize inbox",
      status: "running",
      session_key: "conv-abc",
      agent: "research",
      routine_id: "routine-7",
      updated_at: "2026-07-04T08:00:00Z",
    },
    "/agents/Houston",
    "Houston",
  );
  expect(entry).toEqual({
    id: "act-1",
    title: "Morning digest",
    description: "Summarize inbox",
    status: "running",
    type: "activity",
    session_key: "conv-abc",
    updated_at: "2026-07-04T08:00:00Z",
    agent_path: "/agents/Houston",
    agent_name: "Houston",
    agent: "research",
    routine_id: "routine-7",
  });
});

test("conversation mapping falls back to the activity-<id> session key", () => {
  const entry = activityToConversation(
    {
      id: "act-2",
      title: "New chat",
      description: "",
      status: "running",
    },
    "/agents/Houston",
    "Houston",
  );
  expect(entry.session_key).toBe("activity-act-2");
  expect(entry.agent).toBeUndefined();
  expect(entry.routine_id).toBeUndefined();
});
