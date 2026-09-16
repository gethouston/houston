import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, signInAsViewer } from "./support/identity";
import { openSettings } from "./support/settings-nav";

test.use({ baseURL: AUTH_WEB_URL });

const TICKET = "Tk7-ticket.value_~9";

interface ChannelCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * The gateway, recorded rather than asserted: an expectation thrown inside a
 * route handler fails the request instead of the test, so every claim about
 * what the app sent is made from the test body, after the UI settled.
 */
async function mockChannels(page: Page, configured = true) {
  const calls: ChannelCall[] = [];
  const connections = [
    {
      id: "connection-1",
      provider: "slack",
      accountLabel: "Ada · Houston team",
      spaceId: "personal",
      createdAt: "2026-09-08T12:00:00Z",
    },
  ];
  let bound: (typeof connections)[number] | null = null;
  await page.route("**/v1/channels**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method !== "GET")
      calls.push({ method, path, body: request.postDataJSON() ?? null });
    if (method === "DELETE") {
      connections.splice(0);
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/slack/complete")) {
      // One ticket, one binding: redeeming again binds nothing new, and the
      // test asserts the app never asked twice.
      if (!bound) {
        bound = {
          id: "connection-2",
          provider: "slack",
          accountLabel: "Ada · Personal",
          spaceId: "personal",
          createdAt: "2026-09-08T12:30:00Z",
        };
        connections.push(bound);
      }
      return route.fulfill({ json: { connection: bound } });
    }
    if (path.endsWith("/slack/link")) {
      return route.fulfill({
        json: {
          code: "ABCD-1234",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      });
    }
    return route.fulfill({
      json: {
        providers: [{ id: "slack", name: "Slack", configured }],
        connections,
      },
    });
  });
  return calls;
}

async function openChannels(page: Page) {
  await signInAsViewer(page);
  await openSettings(page);
  await page.getByRole("button", { name: /^Channels/ }).click();
  await expect(
    page.getByRole("heading", { name: "Channels", exact: true }),
  ).toBeVisible();
}

test("Channels provides an existing-installation command and confirms disconnect", async ({
  page,
}) => {
  const calls = await mockChannels(page);
  await openChannels(page);
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Already added Houston to Slack?" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Slack connection command" }),
  ).toHaveValue("connect ABCD-1234");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Connect Slack to message your assistant directly."),
  ).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/slack/link", body: {} },
    {
      method: "DELETE",
      path: "/v1/channels/connections/connection-1",
      body: null,
    },
  ]);
});

test("unconfigured Slack gives setup guidance while retaining disconnect", async ({
  page,
}) => {
  await mockChannels(page, false);
  await openChannels(page);
  await expect(page.getByText(/Ask your Houston administrator/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Slack", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeVisible();
});

test("public callback opens Channels after authenticated reload", async ({
  page,
}) => {
  await mockChannels(page);
  await signInAsViewer(page);
  await page.goto(`${AUTH_WEB_URL}/?settings=channels`);
  await expect(
    page.getByRole("heading", { name: "Channels", exact: true }),
  ).toBeVisible();
});

test("the callback ticket is redeemed once and leaves the address bar", async ({
  page,
}) => {
  const calls = await mockChannels(page);
  await signInAsViewer(page);
  await page.goto(`${AUTH_WEB_URL}/?settings=channels&slack=${TICKET}`);
  await expect(page.getByText("Ada · Personal", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?settings=channels$/);
  // A reload of the cleaned URL has no ticket left to send.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Channels", exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([
    {
      method: "POST",
      path: "/v1/channels/slack/complete",
      body: { ticket: TICKET },
    },
  ]);
});

test("a refused callback ticket says so instead of failing silently", async ({
  page,
}) => {
  await mockChannels(page);
  await page.route("**/v1/channels/slack/complete", (route) =>
    route.fulfill({ status: 404, json: { code: "invalid" } }),
  );
  await signInAsViewer(page);
  await page.goto(`${AUTH_WEB_URL}/?settings=channels&slack=${TICKET}`);
  await expect(
    page.getByText("That Slack connection link is invalid or expired."),
  ).toBeVisible();
});
