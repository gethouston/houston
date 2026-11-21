import { expect, test } from "../support/fixtures";
import { hireWithNoAiConnected } from "../support/no-ai";

test("with no AI connected a fresh hire's screen offers Connect AI, not a start", async ({
  page,
  request,
}) => {
  await hireWithNoAiConnected(request, "Scout");
  await page.goto("/");
  await page.getByTestId("agents-home-row").filter({ hasText: "Scout" }).tap();
  const hero = page
    .getByTestId("agent-missions-screen")
    .getByTestId("first-day-hero");
  await expect(
    hero.getByRole("button", { name: "Connect AI to start" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    hero.getByRole("button", { name: "Start Scout's first day" }),
  ).toHaveCount(0);
});
