import { FAKE_HOST_URL } from "@houston/fake-host";
import { ASSISTANT_COMPOSER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import {
  connectAi,
  managerOnboarding,
  reachTeamStep,
} from "./support/manager-onboarding";
import {
  CLOSING_LINES,
  expectClosing,
  goalCard,
  hireStarterTeam,
  STARTER_ROLES,
  teamCard,
} from "./support/manager-team";
import {
  openManagerOnboarding,
  resetToFirstRun,
  SURVEY_PREF_KEY,
  setAccountPreference,
} from "./support/onboarding";
import { openAssistant } from "./support/settings-nav";

const CLOSING_ASK =
  "What's a task you'd normally do yourself? Tell me and I'll get it done.";
const GOAL = "Chase my overdue invoices every Monday";
const FAILURE = "I couldn't get this started right now.";

test("the goal starts as a card, never as the manager's words", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-reply`, {
    data: { text: FAILURE },
  });
  const hired = await hireStarterTeam(page, null, "click", STARTER_ROLES);

  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible();
  await expect(managerOnboarding(page)).toHaveCount(0);
  await expectClosing(page, GOAL);
  for (const name of hired)
    await expect(
      teamCard(chat).getByRole("button", { name: `Open ${name}` }),
    ).toBeVisible();
  const sent = chat.locator('[data-conversation-message-key^="user-"]');
  await expect(
    sent.filter({ hasText: /^Chase my overdue invoices every Monday$/ }),
  ).toHaveCount(0);

  const card = goalCard(chat);
  await expect(card).toHaveAttribute("data-phase", "failed", {
    timeout: 15_000,
  });
  await expect(card.getByText(FAILURE, { exact: true })).toBeVisible();
  await expect(chat.getByText(FAILURE, { exact: true })).toHaveCount(1);

  await page.reload();
  await openAssistant(page);
  const replayed = goalCard(page.getByTestId("assistant-chat"));
  await expect(replayed).toHaveAttribute("data-phase", "failed");
  await expect(replayed.getByText(FAILURE, { exact: true })).toBeVisible();

  await request.post(`${FAKE_HOST_URL}/__test__/chat-reply`, {
    data: { text: "Still no luck." },
  });
  await replayed.getByRole("button", { name: "Try again" }).click();
  const retried = goalCard(page.getByTestId("assistant-chat"));
  await expect(
    retried.getByText("Still no luck.", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(retried).toHaveCount(1);
});

test("the goal card ticks to started and opens the employee on it", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-tools`, {
    data: {
      calls: [
        {
          name: "start_mission",
          args: { agent: "Avery" },
          mission: { id: "goal-mission", title: GOAL, agent: "Avery" },
        },
      ],
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-reply`, {
    data: { text: "" },
  });
  await hireStarterTeam(page, ["Avery", "Jordan", "Riley"], "click");

  const chat = page.getByTestId("assistant-chat");
  const card = goalCard(chat);
  await expect(card).toHaveAttribute("data-phase", "started", {
    timeout: 15_000,
  });
  for (const step of ["Picked Avery", "Task assigned", "Avery is on it"])
    await expect(card.getByText(step, { exact: true })).toBeVisible();
  await expect(
    card.getByText(
      "You can also open any AI Employee to give them work yourself.",
    ),
  ).toBeVisible();

  await page.reload();
  await openAssistant(page);
  const replayed = goalCard(page.getByTestId("assistant-chat"));
  await expect(replayed).toHaveAttribute("data-phase", "started");
  await replayed.getByRole("button", { name: "Open Avery" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "AI Employee sections" })
      .getByRole("heading", { name: "Avery" }),
  ).toBeVisible();
});

test("an account that skipped the goal before it was required gets asked for a task, and the real chat takes over", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await setAccountPreference(
    request,
    SURVEY_PREF_KEY,
    JSON.stringify({
      version: 2,
      segment: null,
      role: "bookkeeper",
      roleOther: null,
      industry: "accounting",
      industryOther: null,
      companySize: "2_10",
      automationGoal: null,
      goalSkipped: true,
      completionPromptDismissed: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      gatewaySyncedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
  await openManagerOnboarding(page);
  await connectAi(page, "click", "team-basic");
  await hireStarterTeam(page, null, "click", STARTER_ROLES);

  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible({ timeout: 15_000 });
  await expect(managerOnboarding(page)).toHaveCount(0);
  for (const line of CLOSING_LINES)
    await expect(teamCard(chat).getByText(line, { exact: true })).toBeVisible();
  await expect(chat.getByText(CLOSING_ASK, { exact: true })).toBeVisible();
  await expect(goalCard(chat)).toHaveCount(0);
  await expect(teamCard(chat).getByText("Connect your tools")).toHaveCount(0);
  await expect(chat.getByPlaceholder(ASSISTANT_COMPOSER)).toBeFocused();
});

test("the team card promises connecting tools only where the deployment connects them", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await reachTeamStep(page);
  await hireStarterTeam(page, null, "click", STARTER_ROLES);

  await expectClosing(page);
  await expect(
    teamCard(page.getByTestId("assistant-chat")).getByText(
      "Connect your tools",
      { exact: true },
    ),
  ).toBeVisible();
});
