import {
  showFewerProviders,
  subscriptionCard,
  viewMoreProviders,
} from "./support/connect-ai";
import { expect, test } from "./support/fixtures";
import {
  buildTeamHeading,
  completeSurvey,
  connectAiHeading,
  connectAiOnCard,
  resetToFirstRun,
} from "./support/onboarding";

/**
 * First-run's connect beat: after the survey, the full-screen "Connect your
 * AI" card (outside the app shell) leads with two subscription cards, Claude
 * and ChatGPT; "View more" swaps them for every provider in one list.
 * Advancement is app state, never a Next button: the card hands over to
 * "Build your team" the moment the shared provider probe confirms a
 * connection.
 */
test("the connect card follows the survey and advances once a provider connects", async ({
  page,
  request,
}) => {
  // Onboarding shows when the v3 host reports ZERO agents.
  await resetToFirstRun(request);

  await page.goto("/");
  await completeSurvey(page);

  await expect(connectAiHeading(page)).toBeVisible();
  // Outside the shell: no rail, no Mission Control behind the card.
  await expect(page.locator("[data-tour-target='nav-ai-hub']")).toHaveCount(0);

  await connectAiOnCard(page);
  await expect(connectAiHeading(page)).toHaveCount(0);
});

test("View more swaps the featured cards for every provider and back", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);
  await expect(connectAiHeading(page)).toBeVisible();

  await expect(subscriptionCard(page, "Claude")).toBeVisible();
  await expect(subscriptionCard(page, "ChatGPT")).toBeVisible();
  await expect(page.getByPlaceholder("Search providers")).toHaveCount(0);

  await viewMoreProviders(page).click();
  // The button pressed is gone, so focus lands on the one that swaps back.
  const showFewer = showFewerProviders(page);
  await expect(showFewer).toBeFocused();
  await expect(page.getByPlaceholder("Search providers")).toBeVisible();
  // The list replaces the featured cards and includes their providers, listed
  // under the company that makes each one.
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

test("a reload mid-onboarding resumes on the card the user left", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);
  await expect(connectAiHeading(page)).toBeVisible();

  // The survey is answered and nothing is connected: the connect card again.
  await page.reload();
  await expect(connectAiHeading(page)).toBeVisible();

  // Connected: a reload lands straight on the team card.
  await connectAiOnCard(page);
  await page.reload();
  await expect(buildTeamHeading(page)).toBeVisible();
  await expect(connectAiHeading(page)).toHaveCount(0);
});
