import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The global "Skip onboarding" escape hatch: a subtle ghost button pinned to
 * the bottom of the first-run screen (outside the card) so a broken step can
 * never trap the user — support can say "click Skip onboarding".
 *
 * Two properties guarded here:
 *   1. AVAILABILITY: the button is visible from the very FIRST screen (the
 *      segment question) and every step after it, before any assistant
 *      exists. A zero-agent skip is safe: the workspace shell's empty state
 *      offers a "New agent" CTA, and onboarding only ever mounts for users
 *      allowed to create agents.
 *   2. EXIT: clicking it is a terminal exit — onboarding unmounts and the
 *      workspace shell takes over on its zero-agent empty state. The segment
 *      screen's exit is a separate code path (App-level markCompleted, no
 *      orchestrator mounted yet), so both exits are exercised.
 */
async function resetToFirstRun(
  request: Parameters<Parameters<typeof test>[2]>[0]["request"],
) {
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as { id: string }[];
  for (const agent of agents) {
    await request.delete(`${FAKE_HOST_URL}/agents/${agent.id}`);
  }
  // The fake host is shared across this worker's tests, and an earlier skip
  // persists the durable flags — clear them so every test boots first-run.
  // (localStorage mirrors reset for free: fresh browser context per test.)
  for (const key of [
    "onboarding_completed",
    "onboarding_pending",
    "houston_onboarding_segment",
  ]) {
    await request.put(`${FAKE_HOST_URL}/v1/preferences/${key}`, {
      data: { value: null },
    });
  }
}

test("skip-onboarding escape hatch shows on the connect step and exits to the shell", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  await page.goto("/");
  // Segment question: the escape hatch is already present on the very first
  // first-run screen, before the orchestrator (and any agent) exists.
  await expect(
    page.getByRole("button", { name: "Skip onboarding" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Operations/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

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

test("skip-onboarding escape hatch exits straight from the segment screen", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  await page.goto("/");
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  await expect(skip).toBeVisible();

  // Skip without answering the segment question: App-level terminal exit
  // (markCompleted only — no orchestrator, no pending flag) lands on the
  // shell's zero-agent empty state.
  await skip.click();
  await expect(skip).toHaveCount(0);
  await expect(page.getByText("No agents yet")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "New agent" }),
  ).toBeVisible();
});
