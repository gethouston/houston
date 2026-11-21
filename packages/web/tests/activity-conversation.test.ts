import { activityToConversation } from "@houston/engine-adapter/activities";
import { expect, test } from "vitest";

test("conversation mapping keeps the mission-card metadata (agent mode + routine)", () => {
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
  expect("started_by" in entry).toBe(false);
  expect("created_by" in entry).toBe(false);
  expect("contributors" in entry).toBe(false);
});

test("conversation mapping threads Teams attribution (created_by + contributors)", () => {
  const entry = activityToConversation(
    {
      id: "act-3",
      title: "Ship the release",
      description: "",
      status: "running",
      created_by: "user-jane",
      contributors: [
        { user_id: "user-jane", name: "Jane" },
        { user_id: "user-bob" },
      ],
    },
    "/agents/Houston",
    "Houston",
  );
  expect(entry.created_by).toBe("user-jane");
  expect(entry.contributors).toEqual([
    { user_id: "user-jane", name: "Jane" },
    { user_id: "user-bob" },
  ]);
});

test("conversation mapping carries which AI started the mission (PRODUCT-1928)", () => {
  const entry = activityToConversation(
    {
      id: "act-9",
      title: "Weekly report",
      description: "",
      status: "running",
      started_by: "houston",
    },
    "/agents/Ada",
    "Ada",
  );
  expect(entry.started_by).toBe("houston");
});
