import type { Route } from "@playwright/test";
import {
  showFewerProviders,
  subscriptionCard,
  viewMoreProviders,
} from "./support/connect-ai";
import { expect, test } from "./support/fixtures";
import {
  connectAi,
  connectAiStep,
  managerOnboarding,
  managerStep,
  onboardingPrompt,
  receipt,
} from "./support/manager-onboarding";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";

import { workspaceMenuTrigger } from "./support/workspace-menu";

const CONNECT_WAITING = "Waiting for you to sign in";

test("first run opens the manager's chat in the shell, and connecting comes first", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);

  const chat = managerOnboarding(page);
  for (const line of [
    "Hi there!",
    "I'm Houston, your AI Manager. I build and run your team of AI Employees.",
    "Each AI Employee owns one job. They do real work in your tools on their own, and report back when it's done.",
    "You tell me what you need, and I make sure the right AI Employee is on it.",
    "First, let's connect the AI that powers your team.",
  ])
    await expect(chat.getByText(line, { exact: true })).toBeVisible();
  await expect(workspaceMenuTrigger(page)).toBeVisible();
  await expect(chat.locator("textarea")).toHaveCount(0);

  await expect(
    onboardingPrompt(page).getByText("Connect your AI", { exact: true }),
  ).toBeVisible();
  await expect(connectAiStep(page)).toBeVisible();
  await expect(managerStep(page, "survey-industry")).toHaveCount(0);

  await connectAi(page);
  await expect(receipt(page, "Connected OpenRouter.")).toBeVisible();
  await expect(chat.getByText(/^Your AI is connected!/)).toBeVisible();
  await expect(connectAiStep(page)).toHaveCount(0);
});

test("View more swaps the featured cards for every provider and back", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await expect(connectAiStep(page)).toBeVisible();

  await expect(subscriptionCard(page, "Claude")).toBeVisible();
  await expect(subscriptionCard(page, "ChatGPT")).toBeVisible();
  await expect(page.getByPlaceholder("Search providers")).toHaveCount(0);

  await viewMoreProviders(page).click();
  const showFewer = showFewerProviders(page);
  await expect(showFewer).toBeFocused();
  await expect(page.getByPlaceholder("Search providers")).toBeVisible();
  await expect(subscriptionCard(page, "Claude")).toHaveCount(0);
  await expect(subscriptionCard(page, "ChatGPT")).toHaveCount(0);
  await page.getByPlaceholder("Search providers").fill("claude");
  await expect(
    page.getByRole("button", { name: "Connect Anthropic" }),
  ).toBeVisible();

  await showFewer.click();
  await expect(page.getByPlaceholder("Search providers")).toHaveCount(0);
  await expect(subscriptionCard(page, "Claude")).toBeVisible();
  await expect(viewMoreProviders(page)).toBeFocused();
});

test("a reload mid-onboarding resumes on the step the user left", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await expect(connectAiStep(page)).toBeVisible();

  await page.reload();
  await expect(connectAiStep(page)).toBeVisible();

  await connectAi(page);
  await page.reload();
  await expect(managerStep(page, "survey-industry")).toBeVisible();
  await expect(receipt(page, "Connected OpenRouter.")).toBeVisible();
  await expect(connectAiStep(page)).toHaveCount(0);
});

test("the connect card shows at once, before the AI's home has answered", async ({
  page,
  request,
}) => {
  const held: Route[] = [];
  let holding = true;
  await page.route("**/setup-runtime/providers", async (route) => {
    if (holding) held.push(route);
    else await route.continue();
  });
  await resetToFirstRun(request);
  await openManagerOnboarding(page);

  await expect(connectAiStep(page)).toBeVisible();
  const claude = subscriptionCard(page, "Claude");
  await expect(claude).toBeEnabled();
  await claude.click();
  await expect(
    connectAiStep(page).getByText(CONNECT_WAITING, { exact: true }),
  ).toBeVisible();

  holding = false;
  for (const route of held.splice(0)) await route.continue();
  await expect(connectAiStep(page)).toBeVisible();
});
