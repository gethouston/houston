import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The global "Skip onboarding" escape hatch: a subtle ghost button pinned to
 * the bottom of the first-run screen (outside the card) so a broken step can
 * never trap the user — support can say "click Skip onboarding".
 *
 * Two properties guarded here:
 *   1. GATING: the button is HIDDEN until the assistant is provisioned.
 *      `markCompleted` is permanent, so a skip before the agent exists would
 *      strand the user in an empty agentless shell with no way back into
 *      onboarding.
 *   2. EXIT: once visible, clicking it is a terminal exit — onboarding
 *      unmounts and the workspace shell takes over.
 *
 * Reaching the gated state: empty the host's agents (first-run = zero agents),
 * answer the segment question, connect a featured API-key provider (Google
 * Gemini, the fake host accepts any key), which fires the silent background
 * assistant provisioning and lands on the "Your AI is connected!" celebration.
 */
test("skip-onboarding escape hatch hides before provisioning and exits to the shell", async ({
  page,
  request,
}) => {
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as { id: string }[];
  for (const agent of agents) {
    await request.delete(`${FAKE_HOST_URL}/agents/${agent.id}`);
  }

  await page.goto("/");
  await page.getByRole("button", { name: /Operations/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Connect step: no agent exists yet, so the escape hatch must be absent.
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();
  const skip = page.getByRole("button", { name: "Skip onboarding" });
  await expect(skip).toHaveCount(0);

  // Connect an API-key provider; the fake host accepts the pasted key and the
  // orchestrator provisions the assistant in the background.
  await page.getByRole("button", { name: "Connect Google Gemini" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Paste your API key").fill("e2e-fake-key");
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();

  // Celebration screen: once the background provisioning lands, the escape
  // hatch appears at the bottom of the screen.
  await expect(
    page.getByRole("heading", { name: "Your AI is connected!" }),
  ).toBeVisible();
  await expect(skip).toBeVisible();

  // Terminal exit: onboarding unmounts and the workspace shell takes over.
  await skip.click();
  await expect(
    page.getByRole("heading", { name: "Your AI is connected!" }),
  ).toHaveCount(0);
  await expect(skip).toHaveCount(0);
});
