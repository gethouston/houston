import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * A broken connection lives WHERE THE APP LIVES.
 *
 * A connect that never landed (the user walked away from the OAuth, or the
 * provider refused) used to teleport its app out of the catalog and into a
 * recovery pile at the top of the pane — the user pressed Slack in Team chat
 * and Slack reappeared somewhere else entirely. Now the app keeps its normal
 * category rows (spotlight duplicate included): the row wears the connection's
 * status instead of its blurb, its `+` retries the connect right there (the
 * same one-card treatment as any live flow), and its modal is where the
 * half-made connection is finished or removed.
 *
 * Fake host facts: 15 seeded toolkits and one active `gmail` connection.
 * `/__test__/integrations-connection` seeds the at-rest `pending` / `error`
 * states no amount of clicking can reach.
 */

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function seedConnection(
  request: APIRequestContext,
  toolkit: string,
  status: "pending" | "error",
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/integrations-connection`, {
    data: { toolkit, status },
  });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
}

test("an errored app keeps its catalog rows and wears its status there", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "error");
  await openIntegrationsPage(page);

  // Slack is still an ordinary catalog app: both copies (the curated "Most
  // used" spotlight and its Communication section) are present, each with its
  // own connect affordance...
  const slackAdd = page.getByRole("button", { name: "Connect Slack" });
  await expect(slackAdd).toHaveCount(2);

  // ...and each says what is wrong, in place of the app's blurb.
  const status = page.getByText("Needs reconnecting");
  await expect(status).toHaveCount(2);

  // There is NO recovery pile above the catalog: the first thing carrying that
  // status sits BELOW the "Most used" spotlight heading, i.e. down in the rows
  // themselves. (The old design injected an extra, sectionless row on top.)
  const spotlight = await page
    .getByRole("heading", { name: "Most used" })
    .boundingBox();
  const firstStatus = await status.first().boundingBox();
  expect(firstStatus?.y ?? 0).toBeGreaterThan(spotlight?.y ?? 0);

  // And a broken connection is not an installed app: the Installed strip keeps
  // the one working connection only.
  await expect(page.getByRole("heading", { name: "Installed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gmail" })).toBeVisible();
});

test("a pending app reads as unfinished, not as an error", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "pending");
  await openIntegrationsPage(page);

  await expect(page.getByText("Finishing up")).toHaveCount(2);
  await expect(page.getByText("Needs reconnecting")).toHaveCount(0);
});

test("the row's + retries the connect from that row, as one card", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "error");
  await openIntegrationsPage(page);

  // Press the CATEGORY-section copy: the retry is a normal connect, so the
  // hand-off must land on the row that was pressed and nowhere else.
  await page.getByRole("button", { name: "Connect Slack" }).last().click();

  const panel = page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" });
  await expect(panel).toHaveCount(1);
  const card = page
    .locator('div:has(> span[data-live="true"])')
    .filter({ hasText: "Finish connecting Slack" });
  await expect(card).toHaveCount(1);

  // The live flow outranks the at-rest status everywhere: no row says "Needs
  // reconnecting" while the hand-off it describes is on screen.
  await expect(page.getByText("Needs reconnecting")).toHaveCount(0);

  // Cancelling settles the flow on that same row and the status line returns
  // once the notice expires — never a second status beside the notice.
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
  await expect(page.getByText("Needs reconnecting")).toHaveCount(2);
});

test("the app's own dialog offers Reconnect and Remove", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "error");
  await openIntegrationsPage(page);

  // The row body opens the SAME catalog modal a connectable app opens — one
  // dialog per app, now carrying the connection's state. The row's accessible
  // name IS its status line now, so the locator reads the redesign back.
  await page
    .getByRole("button", { name: "Slack Needs reconnecting" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Needs reconnecting")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reconnect" })).toBeVisible();

  // Remove disconnects the half-made connection: the modal closes and Slack is
  // a plain connectable app again, blurb and all.
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Needs reconnecting")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
  ).toHaveCount(2);
});

test("the dialog's Reconnect hands the flow to the row that opened it", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "pending");
  await openIntegrationsPage(page);

  await page
    .getByRole("button", { name: "Slack Finishing up" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  // Pending copy names the unfinished sign-in, never a failure.
  await expect(
    dialog.getByRole("button", { name: "Finish connecting" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Finish connecting" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Finish connecting Slack" }),
  ).toHaveCount(1);
});

test("the agent tab behaves identically: status on the row, no recovery pile", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "error");
  await page.goto("/");
  await page.locator('[data-tour-target="tab-integrations"]').click();

  await expect(page.getByText("Needs reconnecting")).toHaveCount(2);
  const spotlight = await page
    .getByRole("heading", { name: "Most used" })
    .boundingBox();
  const firstStatus = await page
    .getByText("Needs reconnecting")
    .first()
    .boundingBox();
  expect(firstStatus?.y ?? 0).toBeGreaterThan(spotlight?.y ?? 0);

  // The retry is the row's own `+` here too.
  await page.getByRole("button", { name: "Connect Slack" }).last().click();
  await expect(
    page.getByRole("status").filter({ hasText: "Finish connecting Slack" }),
  ).toHaveCount(1);
  await expect(page.getByText("Needs reconnecting")).toHaveCount(0);
});
