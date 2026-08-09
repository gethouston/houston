import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";

/**
 * With zero providers connected, the whole composer (textarea + footer with
 * the model picker) is replaced by the connect-AI empty state, so the user is
 * never shown a phantom model chip or a dead-end input. The CTA routes to the
 * AI Hub. With a provider connected, the composer renders exactly as before.
 */
test("composer is replaced by the connect-AI empty state when no provider is connected", async ({
  page,
  request,
  fakeHost,
}) => {
  await request.post(
    `${fakeHost.url}/agents/houston-assistant/auth/anthropic/logout`,
    { headers: { authorization: "Bearer e2e-token" } },
  );

  await page.goto("/");
  await openNewMission(page);

  await expect(page.getByRole("button", { name: "Connect AI" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByPlaceholder("What should the agent work on?"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Connect AI" }).click();
  await expect(page.getByRole("heading", { name: "AI Models" })).toBeVisible();
});

test("composer renders normally while the provider is connected", async ({
  page,
}) => {
  await page.goto("/");
  await openNewMission(page);
  await expect(
    page.getByPlaceholder("What should the agent work on?"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect AI" })).toHaveCount(0);
});
