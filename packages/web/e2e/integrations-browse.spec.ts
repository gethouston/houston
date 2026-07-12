import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The redesigned personal Integrations page — the flat, airy "plane". A hero
 * title + rounded search sit above a calm stack: an "Installed" strip of the
 * apps already connected (icon tiles that open the detail sheet), then the full
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

  // The Installed strip carries the one active connection as a tile.
  await expect(page.getByRole("heading", { name: "Installed" })).toBeVisible();
  const gmailTile = page.getByRole("button", { name: "Gmail", exact: true });
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

  // A connectable app renders as a flat row (name + one-line description).
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
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

  const search = page.getByRole("textbox", { name: "Search integrations..." });
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

  const slackRow = page.getByRole("button", { name: /Slack Team messaging/ });
  await expect(slackRow).toBeVisible();
  await slackRow.click();

  // The shared waiting panel takes over above the sections while the OAuth
  // hand-off is in flight.
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();

  // Single flight: while one connect owns the flow, other rows are inert.
  await expect(page.getByRole("button", { name: /GitHub/ })).toBeDisabled();

  // Cancel returns the calm catalog — the waiting panel goes away and the rows
  // are interactive again.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /GitHub/ })).toBeEnabled();
});

test("an installed tile opens the app detail sheet", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Gmail", exact: true }).click();

  // The detail sheet is the view + reconnect + disconnect surface.
  await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

  // Escape closes it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
});
