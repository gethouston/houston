import { expect, test } from "./support/fixtures";

/**
 * The AI models hub, end to end against the fake host. The marketplace shows the
 * capability-visible provider cards and the directory holds their models. Cards
 * are not whole-card clickable: a "See more" button opens the provider MODAL,
 * which now embeds the same models ledger (search + table) as the Models tab.
 * Flow: sidebar nav → provider grid → "See more" opens the provider modal →
 * Escape closes → Models tab → search → a row opens the model MODAL ("Get it
 * through" offers) → Escape closes. OAuth is never driven (no credentials in the
 * harness); we assert presence + the modal open/close flow only.
 */
test("opens the AI hub, browses providers and models via modals", async ({
  page,
}) => {
  await page.goto("/");

  // The sidebar carries the new top-level item, between Mission Control and
  // Settings. Opening it lands on the Providers marketplace.
  await page.getByRole("button", { name: "AI models" }).click();

  await expect(page.getByRole("tab", { name: "Providers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Models/ })).toBeVisible();

  // Cards render with always-visible footer actions (no hover gate): every card
  // has a "See more", available providers also a "Connect".
  await expect(page.getByText("Anthropic").first()).toBeVisible();
  const seeMore = page.getByRole("button", { name: "See more" }).first();
  await expect(seeMore).toBeVisible();

  // "See more" opens the provider MODAL: a Radix dialog that embeds the shared
  // models ledger (its own search box), not a full-page drill-in.
  await seeMore.click();
  const providerModal = page.getByRole("dialog");
  await expect(providerModal).toBeVisible();
  await expect(providerModal.getByPlaceholder("Search models")).toBeVisible();

  // Escape closes the modal, returning to the marketplace behind it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Switch to the Models directory and search.
  await page.getByRole("tab", { name: /Models/ }).click();
  const search = page.getByPlaceholder(/Search( \d+\+)? models/);
  await expect(search).toBeVisible();
  await search.fill("claude");

  // A model row opens the model MODAL: its specs + the "Get it through" list of
  // providers that offer it.
  await page
    .getByRole("button", { name: /Claude/i })
    .first()
    .click();
  const modelModal = page.getByRole("dialog");
  await expect(modelModal).toBeVisible();
  await expect(modelModal.getByText("Get it through")).toBeVisible();

  // Escape returns to the directory (the search box is back).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByPlaceholder(/Search( \d+\+)? models/)).toBeVisible();
});
