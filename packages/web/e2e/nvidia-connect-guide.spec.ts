import { expect, test } from "./support/fixtures";
import { completeSurvey, resetToFirstRun } from "./support/onboarding";

/**
 * NVIDIA's connect dialog ships a step-by-step key guide (HOU-890): a working
 * key must be an NGC Personal Key with the "Public API Endpoints" service
 * included — a picker build.nvidia.com's quick key flow never shows — so the
 * dialog walks non-technical users through the NGC page. Guards that the guide
 * renders for NVIDIA and that the generic api-key dialog stays guide-free
 * (OpenRouter shows none).
 *
 * Reaching first-run: onboarding shows when the v3 host reports ZERO agents,
 * so we delete the seeded agent over the API before boot (same entry as
 * onboarding-connect.spec.ts).
 */
test("NVIDIA connect dialog shows the NGC Personal Key guide", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  await page.goto("/");
  await completeSurvey(page);
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();

  // NVIDIA is not featured — search surfaces it from the full catalog.
  const search = page.getByPlaceholder("Search providers");
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
