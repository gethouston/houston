import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
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
    "Houston",
  );
});

test("a fresh hire's own screen offers its first day, and starting it pushes the chat", async ({
  page,
}) => {
  // A new hire with no tasks, its first day waiting for the user
  // (`lib/agent-first-day.ts`).
  // The pending first day is born with the hire, in its create's seeds: a
  // later config write can no longer set it (the host owns the field).
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
  // With no tasks, the start button IS the screen: no "No tasks" note and no
  // status filter compete with it.
  await expect(missions.getByTestId("first-day-hero")).toBeVisible();
  await expect(page.getByTestId("agent-missions-filter")).toHaveCount(0);

  await missions.getByRole("button", { name: "Start Scout's first day" }).tap();

  // The setup task's chat pushes, the way a row tap does, and the offer is
  // gone for good once back on the list.
  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible({ timeout: 10_000 });
  await expect(chat.getByText("Task: Getting set up")).toBeVisible();
  await page.goBack();
  await expect(missions).toBeVisible();
  await expect(missions.getByTestId("first-day-hero")).toHaveCount(0);
  await expect(missions.getByText("Getting set up")).toBeVisible();
});
