import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { activatePendingConnection } from "./support/activate-pending-connection";
import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await openNavRow(page, "integrations");
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

  await expect(page.getByRole("heading", { name: "Installed" })).toBeVisible();
  const gmailTile = page.getByRole("button").filter({ hasText: "Gmail" });
  await expect(gmailTile).toBeVisible();

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

  await expect(page.getByRole("heading", { name: "Most used" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
  ).toHaveCount(2);

  await expect(gmailTile).toHaveCount(1);
});

test("searching filters the category sections live", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await expect(
    page.getByRole("heading", { name: "Productivity" }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search integrations" });
  await search.fill("slack");

  await expect(
    page.getByRole("button", { name: /Slack Team messaging/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Communication" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Productivity" })).toHaveCount(
    0,
  );

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

  const slackAdd = page.getByRole("button", { name: "Connect Slack" });
  await expect(slackAdd).toHaveCount(2);
  await slackAdd.first().click();

  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Finish connecting Slack" }),
  ).toHaveCount(1);

  await expect(slackAdd.first()).toBeDisabled();
  await expect(slackAdd.last()).toBeDisabled();

  const githubAdd = page.getByRole("button", { name: "Connect GitHub" });
  await expect(githubAdd.first()).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /GitHub Issues, PRs, and repos/ }).first(),
  ).toBeEnabled();

  await githubAdd.first().click();
  await expect(page.getByText("Finish connecting GitHub")).toHaveCount(1);
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);

  await page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);
  await expect(page.getByText("Finish connecting GitHub")).toHaveCount(1);
});

test("HighLevel connects through one dialog: the token leads and asks for the sub-account id, Composio with its Sub-Account View guidance is second", async ({
  page,
  request,
}) => {
  await addHighLevelToCatalog(page);
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  const search = page.getByRole("searchbox", { name: "Search integrations" });
  await search.fill("HighLevel");

  await expect(
    page.getByRole("button", { name: "Connect HighLevel" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Connect HighLevel" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Connect HighLevel" }),
  ).toBeVisible();
  const viaToken = dialog.getByRole("button", {
    name: /Connect with a HighLevel token/,
  });
  await expect(viaToken).toContainText("Recommended");
  const viaComposio = dialog.getByRole("button", {
    name: /Connect HighLevel with Composio/,
  });
  await expect(viaComposio).toContainText("Agency View to Sub-Account View");
  await expect(dialog.getByRole("button", { name: /Log in/ })).toHaveCount(0);
  const order = await dialog
    .locator("button.rounded-xl")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent?.slice(0, 12)));
  expect(order).toEqual(["Connect with", "Connect High"]);
  await expect(page.getByText("Finish connecting HighLevel")).toHaveCount(0);

  await viaToken.click();
  await expect(dialog.getByLabel("Sub-account ID")).toBeVisible();
  await dialog.getByRole("textbox", { name: /token|key/i }).fill("pit-test");
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(
    dialog.getByText("Enter the sub-account ID to continue."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Back" }).click();

  await viaComposio.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Finish connecting HighLevel")).toBeVisible();
  await activatePendingConnection(request, "highlevel");
  await expect(search).toHaveValue("", { timeout: 15_000 });
});

test("the owning row becomes ONE card carrying ONE spinner", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Connect Slack" }).first().click();
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();

  const card = page
    .locator('div:has(> span[data-live="true"])')
    .filter({ hasText: "Finish connecting Slack" });
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Slack", { exact: true })).toBeVisible();
  await expect(card.getByText("Team messaging")).toBeVisible();

  await expect(card.getByRole("status", { name: "Loading" })).toHaveCount(1);
  await expect(
    card
      .getByRole("button", { name: "Connect Slack" })
      .getByRole("status", { name: "Loading" }),
  ).toHaveCount(1);

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

  await page.getByRole("button", { name: "Connect Slack" }).last().click();

  await expect(page.getByText("Finish connecting Slack")).toHaveCount(1);
  const panel = page.getByRole("status").filter({
    hasText: "Finish connecting Slack",
  });
  await expect(panel).toHaveCount(1);
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

  await page
    .getByRole("button", { name: /Slack Team messaging/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Slack", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Team messaging")).toBeVisible();
  await expect(dialog.getByText("Communication")).toBeVisible();
  await expect(page.getByText("Finish connecting Slack")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

  await expect(page.getByRole("heading", { name: "Gmail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Reconnect" })).toHaveCount(0);
});

test("ManyChat is a curated card that connects with an API key alone and lands in Installed", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
    data: { items: [] },
  });
  await openIntegrationsPage(page);

  const search = page.getByRole("searchbox", { name: "Search integrations" });
  await search.fill("ManyChat");
  const connect = page.getByRole("button", { name: "Connect ManyChat" });
  await expect(connect).toHaveCount(1);
  await connect.click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Connect ManyChat" }),
  ).toBeVisible();
  const viaKey = dialog.getByRole("button", {
    name: /Connect with a ManyChat API key/,
  });
  await expect(viaKey).toContainText("Recommended");
  await expect(dialog.getByRole("button", { name: /Sign in/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Composio/ })).toHaveCount(0);
  await viaKey.click();
  await expect(dialog.getByText(/Settings, then API/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Open ManyChat to get a key" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Sub-account ID")).toHaveCount(0);

  await dialog.getByRole("textbox", { name: "API key" }).fill("12345:s3cret");
  await dialog.getByRole("button", { name: "Save key" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "ManyChat API" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "ManyChat API" }).getByText("Connected"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect ManyChat" }),
  ).toHaveCount(0);
});
