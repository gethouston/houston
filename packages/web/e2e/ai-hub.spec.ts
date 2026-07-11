import { expect, test } from "./support/fixtures";

/**
 * The AI models hub, end to end against the fake host. The marketplace shows the
 * capability-visible provider cards (a 2-column brand-mark grid, mirroring the
 * Integrations tab) and the directory holds their models. Each card's explicit
 * info button ("View {name} details") is the open affordance — the card body is
 * NOT clickable — and it opens the provider MODAL, which embeds the same model
 * card browser (search + facet filters + card grid) as the Models tab.
 * Flow: sidebar nav → provider grid → info button opens the provider modal →
 * Escape closes → Models tab → facet filters + search → a card opens the model
 * MODAL ("Get it through" offers) → Escape closes. OAuth is never driven (no credentials in
 * the harness); we assert presence + the modal open/close flow only.
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

  // The card body is a static slab; the always-visible info button (labeled
  // with the provider name) is the one open affordance, sitting beside the
  // Connect / Sign out action.
  await expect(page.getByText("Anthropic").first()).toBeVisible();
  const providerInfo = page.getByRole("button", {
    name: "View Anthropic details",
  });
  await expect(providerInfo).toBeVisible();

  // The info button opens the provider MODAL: a Radix dialog that embeds the
  // shared model card browser (its own search box), not a full-page drill-in.
  await providerInfo.click();
  const providerModal = page.getByRole("dialog");
  await expect(providerModal).toBeVisible();
  await expect(providerModal.getByPlaceholder("Search models")).toBeVisible();

  // Escape closes the modal, returning to the marketplace behind it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Switch to the Models directory: a pill search box + the facet comboboxes
  // (the "Good at" facet always shows) above the card grid.
  await page.getByRole("tab", { name: /Models/ }).click();
  const search = page.getByPlaceholder(/Search( \d+\+)? models/);
  await expect(search).toBeVisible();
  await expect(page.getByRole("button", { name: "Good at" })).toBeVisible();
  await search.fill("claude");

  // Each card carries an always-visible "See more" cue (not hover-gated).
  await expect(page.getByText("See more").first()).toBeVisible();

  // A model card opens the model MODAL: its specs + the "Get it through" list of
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
