import { expect, test } from "./support/fixtures";

/**
 * NVIDIA's connect dialog ships a step-by-step key guide (HOU-890): a working
 * key must be an NGC Personal Key with the "Public API Endpoints" service
 * included — a picker build.nvidia.com's quick key flow never shows — so the
 * dialog walks non-technical users through the NGC page. Guards that the guide
 * renders for NVIDIA and that the generic api-key dialog stays guide-free
 * (OpenRouter shows none).
 *
 * Reached through the AI hub — the one standing connect surface (first-run's
 * in-app setup routes through the same hub, so this covers both).
 */
test("NVIDIA connect dialog shows the NGC Personal Key guide", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-tour-target='nav-ai-hub']").click();
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();

  // NVIDIA is not featured — search surfaces it from the full catalog.
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

  // The guide is NVIDIA-only: a generic api-key provider shows no steps.
  await search.fill("openrouter");
  await page.getByRole("button", { name: "Connect OpenRouter" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("How to get your key"),
  ).toHaveCount(0);
});
