import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

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
  await openNavRow(page, "integrations");
}

test("an errored app keeps its catalog rows and wears its status there", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await seedConnection(request, "slack", "error");
  await openIntegrationsPage(page);

  const slackAdd = page.getByRole("button", { name: "Connect Slack" });
  await expect(slackAdd).toHaveCount(2);

  const status = page.getByText("Needs reconnecting");
  await expect(status).toHaveCount(2);

  const spotlight = await page
    .getByRole("heading", { name: "Most used" })
    .boundingBox();
  const firstStatus = await status.first().boundingBox();
  expect(firstStatus?.y ?? 0).toBeGreaterThan(spotlight?.y ?? 0);

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

  await page.getByRole("button", { name: "Connect Slack" }).last().click();

  const panel = page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" });
  await expect(panel).toHaveCount(1);
  const card = page
    .locator('div:has(> span[data-live="true"])')
    .filter({ hasText: "Finish connecting Slack" });
  await expect(card).toHaveCount(1);

  await expect(page.getByText("Needs reconnecting")).toHaveCount(0);

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

  await page
    .getByRole("button", { name: "Slack Needs reconnecting" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Needs reconnecting")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reconnect" })).toBeVisible();

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
  await expect(
    dialog.getByRole("button", { name: "Finish connecting" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Finish connecting" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Finish connecting Slack" }),
  ).toHaveCount(1);
});
