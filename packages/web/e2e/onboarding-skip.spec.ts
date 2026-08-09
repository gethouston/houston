import { expect, test } from "./support/fixtures";
import {
  answerJobStep,
  completeSurvey,
  resetToFirstRun,
} from "./support/onboarding";

/**
 * The global "Skip onboarding" escape hatch: a subtle ghost button pinned to
 * the bottom of the first-run screen (outside the card) so a broken step can
 * never trap the user — support can say "click Skip onboarding".
 *
 * Two properties guarded here:
 *   1. AVAILABILITY: the button is visible from the very FIRST screen (the
 *      survey's job question) and every step after it, before any assistant
 *      exists. A zero-agent skip is safe: the workspace shell's empty state
 *      offers a "New agent" CTA, and onboarding only ever mounts for users
 *      allowed to create agents.
 *   2. EXIT: clicking it is a terminal exit — onboarding unmounts and the
 *      workspace shell takes over on its zero-agent empty state. The survey's
 *      exit is a separate code path (App-level markCompleted, no orchestrator
 *      mounted yet), so both exits are exercised.
 */
test("skip-onboarding escape hatch shows on the connect step and exits to the shell", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  await page.goto("/");
  // Job question: the escape hatch is already present on the very first
  // first-run screen, before the orchestrator (and any agent) exists.
  await expect(
    page.getByRole("button", { name: "Skip onboarding" }),
  ).toBeVisible();
  await completeSurvey(page);

  // Connect step: no agent exists yet, but the escape hatch is already there.
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  await expect(skip).toBeVisible();

  // Terminal exit before any assistant was provisioned: onboarding unmounts
  // and the shell's zero-agent empty state takes over, with the "New agent"
  // recovery CTA.
  await skip.click();
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toHaveCount(0);
  await expect(skip).toHaveCount(0);
  await expect(page.getByText("No agents yet")).toBeVisible();
  // Scoped to main: the sidebar carries its own "New agent" icon button.
  await expect(
    page.getByRole("main").getByRole("button", { name: "New agent" }),
  ).toBeVisible();
});

test("skip-onboarding escape hatch exits straight from the survey", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  await page.goto("/");
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  await expect(skip).toBeVisible();

  // Skip without answering the survey: App-level terminal exit
  // (markCompleted only — no orchestrator, no pending flag) lands on the
  // shell's zero-agent empty state.
  await skip.click();
  await expect(skip).toHaveCount(0);
  await expect(page.getByText("No agents yet")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "New agent" }),
  ).toBeVisible();
});

test("skipping PART WAY through the survey does not bounce into the prompt", async ({
  page,
  request,
}) => {
  // The job question answered and the other two not is exactly the state the
  // in-app completion prompt fires on. Declining onboarding has to decline
  // that prompt too, or Skip re-mounts the survey in the same render and reads
  // as a dead button.
  await resetToFirstRun(request);

  await page.goto("/");
  await answerJobStep(page);
  await expect(
    page.getByRole("heading", { name: "What industry do you work in?" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Skip onboarding" }).click();

  const prompt = page.getByRole("heading", {
    name: "Help us tailor Houston to you",
  });
  await expect(page.getByText("No agents yet")).toBeVisible();
  await expect(prompt).toHaveCount(0);

  // And it stays declined: the dismissal is stored, not just this render.
  await page.reload();
  await expect(page.getByText("No agents yet")).toBeVisible();
  await expect(prompt).toHaveCount(0);
});
