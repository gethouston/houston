import { expect, test } from "./support/fixtures";

/**
 * The AI models hub, end to end against the fake host. The fake host advertises
 * only the `anthropic` provider capability, so the marketplace shows the one
 * Anthropic card and the directory holds its subscription models — enough to
 * exercise the whole surface: sidebar nav → provider grid → Models tab → search
 * → model detail ("Get it through" offers) → back. OAuth is never driven (no
 * credentials in the harness); we assert presence + navigation only.
 */
test("opens the AI hub, browses providers and models, drills in and back", async ({
  page,
}) => {
  await page.goto("/");

  // The sidebar carries the new top-level item, between Mission Control and
  // Settings. Opening it lands on the Providers marketplace.
  await page.getByRole("button", { name: "AI models" }).click();

  await expect(page.getByRole("tab", { name: "Providers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Models/ })).toBeVisible();

  // The one capability-visible provider renders as a marketplace card with an
  // always-visible Connect action (no hover gate).
  await expect(page.getByText("Anthropic").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect" }).first(),
  ).toBeVisible();

  // Switch to the Models directory and search.
  await page.getByRole("tab", { name: /Models/ }).click();
  const search = page.getByPlaceholder(/Search( \d+\+)? models/);
  await expect(search).toBeVisible();
  await search.fill("claude");

  // Open the first matching model → its detail with the "Get it through" list of
  // providers that offer it (the Anthropic subscription offer).
  await page
    .getByRole("button", { name: /Claude/i })
    .first()
    .click();
  await expect(page.getByText("Get it through")).toBeVisible();
  await expect(page.getByText("Anthropic").first()).toBeVisible();

  // Single-level back returns to the model directory (the search box is back).
  await page.getByRole("button", { name: "All models" }).click();
  await expect(page.getByPlaceholder(/Search( \d+\+)? models/)).toBeVisible();
});
