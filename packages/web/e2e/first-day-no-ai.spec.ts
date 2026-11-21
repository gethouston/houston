import { expect, test } from "./support/fixtures";
import { hireWithNoAiConnected } from "./support/no-ai";
import { openAgentScreen, screen } from "./support/team-nav";

test("with no AI connected the first-day hero offers Connect AI, not a start", async ({
  page,
  request,
}) => {
  await hireWithNoAiConnected(request, "Scout");
  await page.goto("/");
  await openAgentScreen(page, "Scout");

  const hero = screen(page).getByTestId("first-day-hero");
  await expect(
    hero.getByRole("button", { name: "Connect AI to start" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    hero.getByRole("button", { name: "Start Scout's first day" }),
  ).toHaveCount(0);

  await hero.getByRole("button", { name: "Connect AI to start" }).click();
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();
});
