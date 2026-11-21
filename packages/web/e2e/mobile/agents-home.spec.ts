import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { awaitAgentsHome } from "../support/mobile-nav";
import {
  ARCHIVED_HOUSTON_MISSION,
  ORIGIN_MISSIONS,
  seedOriginMissions,
} from "../support/origin-missions";
import { seedSidebarLayout } from "../support/sidebar-layout";

test("an agent in no folder remains in the phone AI Employees list", async ({
  page,
}) => {
  await seedSidebarLayout(page.request, {
    groups: [],
    order: [{ kind: "agent", id: SEED_AGENT_ID }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator('[data-tab="agents"]').tap();
  await expect(
    page
      .getByTestId("agents-home-new-agent")
      .locator('svg[viewBox="0 0 412.248 448.898"]'),
  ).toHaveCount(1);
  await expect(page.locator('[data-screen-active="true"]')).toContainText(
    SEED_AGENT_NAME,
  );
});

test("a fresh hire's own screen offers its first day, and starting it pushes the chat", async ({
  page,
}) => {
  await page.request.post(`${FAKE_HOST_URL}/agents`, {
    data: {
      name: "Scout",
      seeds: {
        ".houston/config/config.json": JSON.stringify({ firstDay: "pending" }),
      },
    },
  });

  await page.goto("/");
  await page.getByTestId("agents-home-row").filter({ hasText: "Scout" }).tap();
  const missions = page.getByTestId("agent-missions-screen");
  await expect(missions.getByTestId("first-day-hero")).toBeVisible();
  await expect(page.getByTestId("agent-missions-filter")).toHaveCount(0);

  await missions.getByRole("button", { name: "Start Scout's first day" }).tap();

  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible({ timeout: 10_000 });
  await expect(chat.getByText("Task: Getting set up")).toBeVisible();
  await page.goBack();
  await expect(missions).toBeVisible();
  await expect(missions.getByTestId("first-day-hero")).toHaveCount(0);
  await expect(missions.getByText("Getting set up")).toBeVisible();
});

test("a task row says who started it, the same tag the board card wears", async ({
  page,
  request,
}) => {
  await seedOriginMissions(request);
  await page.goto("/");
  await (await awaitAgentsHome(page)).tap();
  const list = page.getByTestId("agent-missions-screen");
  const row = (title: string) =>
    list.getByTestId("agent-mission-row").filter({ hasText: title });

  for (const mission of ORIGIN_MISSIONS)
    await expect(
      row(mission.title).getByTestId("agent-mission-origin"),
    ).toHaveText(mission.tag);
  await expect(
    row("Plan a trip to Tokyo").getByTestId("agent-mission-origin"),
  ).toHaveCount(0);

  await list.getByTestId("agent-missions-archived-toggle").tap();
  await expect(
    row(ARCHIVED_HOUSTON_MISSION.title).getByTestId("agent-mission-origin"),
  ).toHaveText(ARCHIVED_HOUSTON_MISSION.tag);
});
