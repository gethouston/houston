import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The redesigned personal Integrations page — the flat, airy "plane". A hero
 * title + rounded search sit above a calm stack: an "Installed" strip of the
 * apps already connected (icon tiles that open the detail modal), then the full
 * connectable catalog grouped into flat category sections. Connected apps never
 * repeat in the catalog (the seed's one active Gmail connection appears ONLY as
 * an installed tile, never as a catalog row). The page-level search filters the
 * category sections live; the installed strip stays unfiltered.
 *
 * Fake host facts: 15 seeded toolkits across productivity / communication /
 * developer-tools / sales (`SEED_TOOLKITS`) and one active `gmail` connection.
 * Personal mode is the default; arming `{ integrations: ["composio"] }` turns
 * the page on without the Teams policy surface.
 */

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
}

test("the browse page groups the catalog into category sections with an installed strip", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // The Installed strip carries the one active connection as a tile (a catalog
  // row: name + one-line description).
  await expect(page.getByRole("heading", { name: "Installed" })).toBeVisible();
  const gmailTile = page.getByRole("button").filter({ hasText: "Gmail" });
  await expect(gmailTile).toBeVisible();

  // The catalog is grouped into flat category sections — every seeded category
  // is present as a section header (the biggest, Productivity with 6 apps once
  // Gmail is excluded, leads).
  await expect(
    page.getByRole("heading", { name: "Productivity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Communication" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Developer tools" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();

  // A connectable app renders as a flat row (name + one-line description). Slack
  // is an everyday app, so at rest it appears in BOTH the curated Featured
  // spotlight and its Communication section — take the first.
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }).first(),
  ).toBeVisible();

  // Gmail is connected, so it appears ONCE — the installed tile — and never as
  // a catalog row.
  await expect(gmailTile).toHaveCount(1);
});

test("searching filters the category sections live", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // Sanity: Productivity is present before the search narrows the plane.
  await expect(
    page.getByRole("heading", { name: "Productivity" }),
  ).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search integrations" });
  await search.fill("slack");

  // Only the section holding Slack (Communication) survives; the Slack row
  // stays, and the now-empty Productivity section drops out entirely.
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Communication" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productivity" })).toHaveCount(
    0,
  );

  // Clearing the query brings every section back.
  await search.fill("");
  await expect(
    page.getByRole("heading", { name: "Productivity" }),
  ).toBeVisible();
});

test("clicking a row's + starts the connect flow", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // The filled + at the row's right edge is the install affordance. Slack is
  // featured AND in its category section, so take the first + it renders.
  const slackAdd = page.getByRole("button", { name: "Connect Slack" }).first();
  await expect(slackAdd).toBeVisible();
  await slackAdd.click();

  // The shared waiting panel takes over above the sections while the OAuth
  // hand-off is in flight.
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();

  // Single flight: while one connect owns the flow, the other + buttons
  // disable. The row BODIES stay clickable (reading about an app is safe).
  await expect(
    page.getByRole("button", { name: "Connect GitHub" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /GitHub Issues, PRs, and repos/ }),
  ).toBeEnabled();

  // Cancel returns the calm catalog — the waiting panel goes away and the +
  // buttons are interactive again.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect GitHub" }),
  ).toBeEnabled();
});

test("clicking a row's body opens the more-info modal, and its CTA connects", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // The row body (name + description) opens the detail modal, not a connect.
  // Slack is featured AND in its category section — either row body opens the
  // same modal, so take the first.
  await page
    .getByRole("button", { name: /Slack Team messaging/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Slack", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Team messaging")).toBeVisible();
  // The app's category renders as a chip.
  await expect(dialog.getByText("Communication")).toBeVisible();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);

  // The modal's CTA hands off to the same connect flow and closes the modal.
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("an installed tile opens the app detail modal", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await page.getByRole("button").filter({ hasText: "Gmail" }).click();

  // The detail modal is the view + reconnect + disconnect surface.
  await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
});
