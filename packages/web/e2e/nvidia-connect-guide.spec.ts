import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

test("NVIDIA connect dialog shows the NGC Personal Key guide", async ({
  page,
}) => {
  await page.goto("/");
  await openNavRow(page, "ai-hub");
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();

  const search = page.getByPlaceholder("Search AI models and providers");
  await search.fill("nvidia");
  await page.getByRole("button", { name: "Connect NVIDIA" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("How to get your key")).toBeVisible();
  await expect(dialog.getByText(/Generate Personal Key/)).toBeVisible();
  await expect(dialog.getByText(/Public API Endpoints/)).toBeVisible();
  await expect(dialog.getByText(/nvapi-/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await search.fill("openrouter");
  await page.getByRole("button", { name: "Connect OpenRouter" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("How to get your key"),
  ).toHaveCount(0);
});
