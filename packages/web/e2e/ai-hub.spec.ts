import { expect, test } from "./support/fixtures";

/**
 * The AI models hub, end to end against the fake host — now in the shared
 * catalog-shell grammar (the same layout as the Integrations page): a
 * consolidated "Connected" strip of provider brand tiles OUTSIDE the tabs
 * (the fake host seeds Claude/Anthropic connected), then the Providers /
 * Models tabs with count chips. A strip tile or a provider row's BODY opens
 * the provider MODAL (which embeds the same model card browser as the Models
 * tab); the ghost `+` on a row is the direct connect affordance. Flow:
 * sidebar nav → strip tile opens the provider modal → Escape closes →
 * Providers tab shows the connectable rows with their `+` → Models tab →
 * facet filters + search → a card opens the model MODAL ("Get it through"
 * offers) → Escape closes. OAuth is never driven (no credentials in the
 * harness); we assert presence + the modal open/close flow only.
 */
test("opens the AI hub, browses providers and models via modals", async ({
  page,
}) => {
  await page.goto("/");

  // The sidebar carries the top-level item. Opening it lands on the hub.
  await page.getByRole("button", { name: "AI models" }).click();

  await expect(page.getByRole("tab", { name: "Providers" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Models/ })).toBeVisible();

  // The consolidated Connected strip sits OUTSIDE the tabs: the seeded
  // Anthropic connection is a brand tile, not a row in the browse grid.
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  const anthropicTile = page.getByRole("button", {
    name: "Anthropic",
    exact: true,
  });
  await expect(anthropicTile).toBeVisible();

  // A tile opens the provider MODAL: a Radix dialog that embeds the shared
  // model card browser (its own search box), not a full-page drill-in.
  await anthropicTile.click();
  const providerModal = page.getByRole("dialog");
  await expect(providerModal).toBeVisible();
  await expect(providerModal.getByPlaceholder("Search models")).toBeVisible();

  // Escape closes the modal, returning to the marketplace behind it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // The Providers tab browses only the NOT-connected providers as flat rows,
  // each with a ghost `+` connect affordance at its right edge.
  await expect(
    page.getByRole("button", { name: /^Connect / }).first(),
  ).toBeVisible();

  // Switch to the Models directory: a pill search box + the facet comboboxes
  // (the "Good at" facet always shows) above the catalog-grammar row grid.
  await page.getByRole("tab", { name: /Models/ }).click();
  const search = page.getByPlaceholder(/Search( \d+\+)? models/);
  await expect(search).toBeVisible();
  await expect(page.getByRole("button", { name: "Good at" })).toBeVisible();
  await search.fill("claude");

  // A model row (name + lab, whole row is the button) opens the model MODAL:
  // its specs + the "Get it through" list of providers that offer it.
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
