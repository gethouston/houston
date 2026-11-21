import type { Page } from "@playwright/test";

export function subscriptionCard(page: Page, plan: "Claude" | "ChatGPT") {
  return page.getByRole("button", {
    name: new RegExp(`^Your ${plan} subscription`),
  });
}

export function viewMoreProviders(page: Page) {
  return page.getByRole("button", { name: "View more" });
}

export function showFewerProviders(page: Page) {
  return page.getByRole("button", { name: "Show fewer options" });
}
