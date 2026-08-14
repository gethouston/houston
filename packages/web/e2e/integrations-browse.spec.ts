import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { activatePendingConnection } from "./support/activate-pending-connection";
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

async function addHighLevelToCatalog(page: Page): Promise<void> {
  await page.route("**/v1/integrations/composio/toolkits", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { items: unknown[] };
    await route.fulfill({
      response,
      json: {
        items: [
          ...body.items,
          {
            slug: "highlevel",
            name: "HighLevel",
            description: "CRM and marketing automation",
            categories: ["sales"],
          },
        ],
      },
    });
  });
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
  // is an everyday app, so at rest it appears in BOTH the curated "Most used"
  // spotlight and its Communication section — the spotlight is a spotlight, not
  // a move, so the row is deliberately present twice.
  await expect(page.getByRole("heading", { name: "Most used" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
  ).toHaveCount(2);

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

  const search = page.getByRole("searchbox", { name: "Search integrations" });
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

test("catalog search clears manually and after its matching app connects", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  const search = page.getByRole("searchbox", { name: "Search integrations" });
  const clear = page.getByRole("button", { name: "Clear search" });
  await expect(clear).toHaveCount(0);

  await search.fill("Slack");
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(search).toHaveValue("");

  await search.fill("Slack");
  await page.getByRole("button", { name: "Connect Slack" }).first().click();
  await activatePendingConnection(request, "slack");

  await expect(search).toHaveValue("", { timeout: 15_000 });
});

test("a delayed connection preserves a newer non-matching search", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  const search = page.getByRole("searchbox", { name: "Search integrations" });
  await search.fill("Slack");
  await page.getByRole("button", { name: "Connect Slack" }).first().click();
  await search.fill("Notion");
  await activatePendingConnection(request, "slack");

  await expect(search).toHaveValue("Notion", { timeout: 15_000 });
});

test("a row's + connects INLINE, exactly once, leaving every other row usable", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // The + at the row's right edge is the install affordance. Slack sits in the
  // "Most used" spotlight AND in Communication, so the page really does show
  // two Slack rows: the guard is that only ONE of them expands.
  const slackAdd = page.getByRole("button", { name: "Connect Slack" });
  await expect(slackAdd).toHaveCount(2);
  await slackAdd.first().click();

  // The waiting state lands INLINE, under the row the user clicked — there is
  // no page-level banner shoving the sections down, and no second copy of the
  // panel (two live regions announcing one hand-off, two rival Cancel buttons)
  // under the duplicate row.
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Finish connecting Slack" }),
  ).toHaveCount(1);

  // The duplicate row is NOT silent about it though: the flow is per slug, so
  // both of Slack's + buttons show it is busy.
  await expect(slackAdd.first()).toBeDisabled();
  await expect(slackAdd.last()).toBeDisabled();

  // Connects are per app and concurrent: every OTHER row stays fully usable,
  // both its + and its body. A whole-surface lockout is the bug this replaced.
  const githubAdd = page.getByRole("button", { name: "Connect GitHub" });
  await expect(githubAdd.first()).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /GitHub Issues, PRs, and repos/ }).first(),
  ).toBeEnabled();

  // Proving it: a SECOND app hands off while the first is still waiting, and
  // both rows carry their own live state — one panel each.
  await githubAdd.first().click();
  await expect(page.getByText("Finish connecting GitHub")).toHaveCount(1);
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);

  // Cancel addresses ONE flow: Slack's state clears, GitHub keeps waiting.
  // Each inline state is its own live region, so scoping by it is exact.
  await page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
  await expect(page.getByText("Finish connecting GitHub")).toHaveCount(1);
});

test("HighLevel explains the required Sub-Account View before opening OAuth", async ({
  page,
  request,
}) => {
  await addHighLevelToCatalog(page);
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Connect HighLevel" }).click();

  const guidance = page.getByRole("alertdialog");
  await expect(
    guidance.getByRole("heading", {
      name: "Choose Sub-Account View in HighLevel",
    }),
  ).toBeVisible();
  await expect(
    guidance.getByText("Agency View", { exact: true }),
  ).toBeVisible();
  await expect(
    guidance.getByText("Choose Sub-Account View.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Finish connecting HighLevel")).toHaveCount(0);

  await guidance.getByRole("button", { name: "Continue to HighLevel" }).click();
  await expect(page.getByText("Finish connecting HighLevel")).toBeVisible();
});

test("the owning row becomes ONE card carrying ONE spinner", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Connect Slack" }).first().click();
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();

  // The card is ONE container: the app header (logo + name + description) and
  // the flow copy share a single bordered box, so the state can never read as a
  // detached panel floating under an unrelated row. `data-live` is the card
  // treatment's own layer — present only while this row owns a flow.
  const card = page
    .locator('div:has(> span[data-live="true"])')
    .filter({ hasText: "Finish connecting Slack" });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Slack", { exact: true })).toBeVisible();
  await expect(card.getByText("Team messaging")).toBeVisible();

  // ONE spinner in it, in the header's `+` slot where the user clicked. The
  // flow copy below adds words, never a second thing turning.
  await expect(card.getByRole("status", { name: "Loading" })).toHaveCount(1);
  await expect(
    card
      .getByRole("button", { name: "Connect Slack" })
      .getByRole("status", { name: "Loading" }),
  ).toHaveCount(1);

  // And NO box inside the box: nothing in the live region draws a border of its
  // own (the outlined Reopen pill is a control, not a container).
  const nested = await card
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" })
    .evaluate(
      (el) =>
        [el, ...el.querySelectorAll("*")].filter(
          (n) =>
            n.tagName !== "BUTTON" &&
            getComputedStyle(n).borderTopWidth !== "0px",
        ).length,
    );
  expect(nested).toBe(0);

  // The duplicate copy of Slack is NOT carded — it stays a flat catalog row
  // with the compact busy `+`, so one hand-off is one card.
  await expect(page.locator('span[data-live="true"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Connect Slack" }).last(),
  ).toBeDisabled();
});

test("the row the user pressed owns the panel, not the first copy of the app", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // Press the CATEGORY-section Slack row (the second copy), not the spotlight
  // one: the feedback must appear under the row that was clicked, so scoping to
  // the Communication section finds it there and nowhere else.
  await page.getByRole("button", { name: "Connect Slack" }).last().click();

  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);
  const panel = page.getByRole("status").filter({
    hasText: "Finish connecting Slack",
  });
  await expect(panel).toHaveCount(1);
  // It is BELOW the "Most used" spotlight's own Slack row, i.e. down in the
  // category section: the spotlight row (first) did not steal it.
  const spotlightRow = page
    .getByRole("button", { name: /Slack Team messaging/ })
    .first();
  const rowBox = await spotlightRow.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox?.y ?? 0).toBeGreaterThan(rowBox?.y ?? 0);

  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
});

test("clicking a row's body opens the more-info modal, and its CTA connects", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  // The row body (name + description) opens the detail modal, not a connect.
  // Slack is in the spotlight AND in its category section; either body opens the
  // same modal, and the modal remembers WHICH row it came from.
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

  // The modal's CTA hands off to the same connect flow, closes the modal, and
  // the state appears on Slack's own row (never as a page-level banner).
  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // On the row the modal was opened from, and on that row ONLY.
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);
  await page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" })
    .getByRole("button", { name: "Cancel" })
    .click();
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
