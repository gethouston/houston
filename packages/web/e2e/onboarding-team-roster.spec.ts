import { ASSISTANT_AGENT_ID, FAKE_HOST_URL } from "@houston/fake-host";
import type { Route } from "@playwright/test";
import { evictMidClosing, holdClosingSave } from "./support/closing-save";
import { expect, test } from "./support/fixtures";
import { managerOnboarding, reachTeamStep } from "./support/manager-onboarding";
import {
  afterHire,
  CLOSING_LINES,
  finishOnboarding,
  goalCard,
  hireStarterTeam,
  roster,
  STARTER_ROLES,
  starterTeam,
  TEAM_DONE_CHOICE,
  teamNext,
} from "./support/manager-team";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";
import { agentRow } from "./support/team-nav";

test("renamed cards hire under the names given", async ({ page, request }) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);

  const names = ["Olivia", "Felix", "Nora"];
  await hireStarterTeam(page, names, "click", STARTER_ROLES);
  await finishOnboarding(page);
  for (const name of names) await expect(agentRow(page, name)).toBeVisible();
});

test("a tab evicted after the team is hired resumes on it, and That's my team closes", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  const release = await holdClosingSave(request);
  await hireStarterTeam(page, null, "click", STARTER_ROLES);

  const resumed = await evictMidClosing(page);
  await release();
  await expect(
    managerOnboarding(resumed).getByText(
      "You already have 3 AI Employees on your team. Let's pick up where you left off.",
    ),
  ).toBeVisible();
  await expect(teamNext(resumed)).toBeVisible();
  await expect(roster(resumed).locator('li[data-status="hired"]')).toHaveCount(
    3,
  );

  await afterHire(resumed, TEAM_DONE_CHOICE);
  const chat = resumed.getByTestId("assistant-chat");
  await expect(chat).toBeVisible({ timeout: 15_000 });
  await expect(managerOnboarding(resumed)).toHaveCount(0);
  await expect(goalCard(chat)).toBeVisible();
  for (const name of STARTER_ROLES)
    await expect(agentRow(resumed, name)).toBeVisible();
});

test("a reload after the team is hired resumes on it", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  const release = await holdClosingSave(request);
  await hireStarterTeam(page, null, "click", STARTER_ROLES);

  await page.reload();
  await release();
  await expect(teamNext(page)).toBeVisible();
  await expect(roster(page).locator('li[data-status="hired"]')).toHaveCount(3);

  await afterHire(page, TEAM_DONE_CHOICE);
  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible({ timeout: 15_000 });
  await expect(goalCard(chat)).toBeVisible();
  const history = await request.get(
    `${FAKE_HOST_URL}/agents/${ASSISTANT_AGENT_ID}/conversations/assistant/messages?limit=120`,
  );
  const { messages } = (await history.json()) as {
    messages: { role: string; content: string }[];
  };
  expect(
    messages.filter((m) => m.content.includes(CLOSING_LINES[0])),
  ).toHaveLength(1);
});

test("a hire that failed says so on its card, and Retry lands it", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  let failures = 1;
  await page.route(
    (url) => url.pathname === "/agents",
    async (route: Route) => {
      if (route.request().method() !== "POST" || failures === 0) {
        await route.continue();
        return;
      }
      failures -= 1;
      await route.fulfill({
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: { message: "create failed" } }),
      });
    },
  );
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  const step = starterTeam(page);
  await step.getByRole("button", { name: "Hire my team" }).click();

  await expect(
    step.getByText("We could not create this AI Employee. Please try again."),
  ).toBeVisible();
  await expect(
    managerOnboarding(page).getByText("Your team is ready!", { exact: true }),
  ).toHaveCount(0);

  await step.getByRole("button", { name: /^Try hiring .+ again$/ }).click();
  await step.getByRole("button", { name: "Hire my team" }).click();
  await expect(
    managerOnboarding(page)
      .or(page.getByTestId("assistant-chat"))
      .getByText("Your team is ready!", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await finishOnboarding(page);
});
