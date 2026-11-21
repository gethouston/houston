import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { APIRequestContext, APIResponse } from "@playwright/test";

export const ORIGIN_MISSIONS = [
  {
    id: "origin-houston",
    title: "Summarize the week",
    tag: "Started by Houston",
  },
  { id: "origin-routine", title: "Morning digest", tag: "Routine" },
  {
    id: "origin-employee",
    title: "Check the inbox",
    tag: "Started by AI Employee",
  },
] as const;

export const ARCHIVED_HOUSTON_MISSION = {
  id: "origin-houston-archived",
  title: "Last month's recap",
  tag: "Started by Houston",
} as const;

const ACTIVITY_FILE = ".houston/activity/activity.json";

async function expectOk(response: Promise<APIResponse>): Promise<APIResponse> {
  const res = await response;
  if (!res.ok())
    throw new Error(
      `seeding ${res.url()} failed: ${res.status()} ${await res.text()}`,
    );
  return res;
}

export async function seedOriginMissions(
  request: APIRequestContext,
): Promise<void> {
  const activities = `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`;
  const [houston, routine, employee] = ORIGIN_MISSIONS;
  await expectOk(
    request.post(activities, {
      data: {
        id: houston.id,
        title: houston.title,
        status: "needs_you",
        started_by: "houston",
      },
    }),
  );
  await expectOk(
    request.post(activities, {
      data: {
        id: employee.id,
        title: employee.title,
        status: "needs_you",
        origin_session_key: "activity-parent",
      },
    }),
  );
  await expectOk(
    request.post(activities, {
      data: {
        id: ARCHIVED_HOUSTON_MISSION.id,
        title: ARCHIVED_HOUSTON_MISSION.title,
        status: "archived",
        started_by: "houston",
      },
    }),
  );
  const file = `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/agentfile/${ACTIVITY_FILE}`;
  const { content } = (await (await expectOk(request.get(file))).json()) as {
    content: string;
  };
  const rows = JSON.parse(content || "[]") as unknown[];
  await expectOk(
    request.put(file, {
      data: {
        content: JSON.stringify([
          ...rows,
          {
            id: routine.id,
            title: routine.title,
            description: "",
            status: "needs_you",
            routine_id: "routine-digest",
            updated_at: new Date().toISOString(),
          },
        ]),
      },
    }),
  );
}
