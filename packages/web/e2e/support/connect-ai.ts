/**
 * Locators for the "Connect your AI" card's own controls: the featured
 * subscription cards and the "View more" / "Show fewer options" pair that
 * swaps them for the full provider list and back.
 */
import type { Page } from "@playwright/test";

/** The "Connect your AI" card's featured Claude / ChatGPT subscription cards. */
export function subscriptionCard(page: Page, plan: "Claude" | "ChatGPT") {
  return page.getByRole("button", {
    name: new RegExp(`^Your ${plan} subscription`),
  });
}

/** "View more": replaces the featured cards with every provider. */
export function viewMoreProviders(page: Page) {
  return page.getByRole("button", { name: "View more" });
}

/** "Show fewer options": returns from the full list to the featured cards. */
export function showFewerProviders(page: Page) {
  return page.getByRole("button", { name: "Show fewer options" });
}
