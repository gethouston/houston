import {
  mockChannels,
  openChannels,
  SLACK_CONNECTION,
  slackCard,
  WHATSAPP_CODES,
  whatsAppCard,
} from "./support/channels";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, signInAsViewer } from "./support/identity";

test.use({ baseURL: AUTH_WEB_URL });

const TICKET = "Tk7-ticket.value_~9";
const WAITING = "Waiting for your message…";

test("connected Slack names its workspace and offers another", async ({
  page,
}) => {
  await mockChannels(page);
  await openChannels(page);
  const slack = slackCard(page);
  await expect(slack.getByText("Connected", { exact: true })).toBeVisible();
  const workspaces = slack.getByRole("list");
  await expect(slack.getByText("Workspaces", { exact: true })).toBeVisible();
  await expect(
    workspaces.getByText("Ada · Houston team", { exact: true }),
  ).toBeVisible();
  await expect(
    workspaces.getByRole("button", { name: "Add another workspace" }),
  ).toBeVisible();
  await expect(
    slack.getByRole("button", { name: "Connect Slack", exact: true }),
  ).toHaveCount(0);
  const whatsApp = whatsAppCard(page);
  await expect(whatsApp.getByText("Connected", { exact: true })).toHaveCount(0);
  await expect(
    whatsApp.getByRole("button", { name: "Connect WhatsApp" }),
  ).toBeVisible();
});

test("an empty Slack card connects through Slack's own page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ opener: null }) as unknown as Window;
  });
  const { calls } = await mockChannels(page, { connections: [] });
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/v1/channels/slack/connect", async (route) => {
    await answered;
    await route.fallback();
  });
  await openChannels(page);
  const slack = slackCard(page);
  await slack
    .getByRole("button", { name: "Connect Slack", exact: true })
    .click();
  await expect(
    slack.getByRole("button", { name: "Opening Slack…" }),
  ).toBeDisabled();
  answer();
  await expect(
    slack.getByText("Finish connecting in Slack, then return here."),
  ).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/slack/connect", body: {} },
  ]);
});

test("only a connection that lands while the card is open fades in", async ({
  page,
}) => {
  const { connections } = await mockChannels(page);
  let refuse = () => {};
  const refused = new Promise<void>((resolve) => {
    refuse = resolve;
  });
  await page.route("**/v1/channels/connections/**", async (route) => {
    await refused;
    await route.fulfill({ status: 500, json: { code: "internal" } });
  });
  await openChannels(page);
  const workspaces = slackCard(page).getByRole("list", { name: "Workspaces" });
  const first = workspaces
    .getByRole("listitem")
    .filter({ hasText: "Ada · Houston team" });
  await expect(first).toBeVisible();
  await expect(first).not.toHaveClass(/row-land-in/);
  connections.push({
    id: "connection-new",
    provider: "slack",
    accountLabel: "Ada · Elsewhere",
    spaceId: "personal",
    createdAt: "2026-09-08T14:00:00Z",
  });
  await page.getByRole("button", { name: "Refresh connections" }).click();
  const landed = workspaces
    .getByRole("listitem")
    .filter({ hasText: "Ada · Elsewhere" });
  await expect(landed).toHaveClass(/row-land-in/);
  await expect(first).not.toHaveClass(/row-land-in/);
  await page
    .getByRole("button", { name: "Disconnect Ada · Elsewhere" })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(landed).toHaveCount(0);
  refuse();
  await expect(landed).toBeVisible();
  await expect(landed).not.toHaveClass(/row-land-in/);
});

test("Channels provides an existing-installation command and confirms disconnect", async ({
  page,
}) => {
  const { calls } = await mockChannels(page);
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
  const disconnect = page.getByRole("button", {
    name: "Disconnect Ada · Houston team",
  });
  await disconnect.click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", { name: "Disconnect Slack?" }),
  ).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toBeVisible();
  await disconnect.click();
  await confirmation
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toHaveCount(0);
  const slack = slackCard(page);
  await expect(
    slack.getByRole("heading", { name: "Slack", exact: true }),
  ).toBeFocused();
  await expect(
    slack.getByRole("button", { name: "Connect Slack", exact: true }),
  ).toBeVisible();
  await expect(slack.getByText("Connected", { exact: true })).toHaveCount(0);
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/slack/link", body: {} },
    {
      method: "DELETE",
      path: "/v1/channels/connections/connection-1",
      body: null,
    },
  ]);
});

test("WhatsApp shows its prefilled message, QR code, and open action", async ({
  page,
}) => {
  const { calls } = await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  const qr = page.getByRole("img", {
    name: "QR code to open WhatsApp with your connection message",
  });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("data-qr-value", WHATSAPP_CODES[0].url);
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveValue(`connect ${WHATSAPP_CODES[0].code}`);
  await expect(
    page.getByText("Or send this message to +15550001111:"),
  ).toBeVisible();
  const open = page.getByRole("link", { name: "Open WhatsApp" });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", WHATSAPP_CODES[0].url);
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText(WAITING)).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/whatsapp/link", body: {} },
  ]);
});

test("an expired WhatsApp code says so and a new one replaces it", async ({
  page,
}) => {
  const { calls } = await mockChannels(page, {
    whatsAppCodeTtlMs: [1_500, 600_000],
  });
  await openChannels(page);
  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveValue(`connect ${WHATSAPP_CODES[0].code}`);
  await expect(
    page.getByText("This code has expired. Get a new code to connect."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR code/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open WhatsApp" })).toHaveCount(
    0,
  );
  await expect(page.getByText(WAITING)).toHaveCount(0);
  await expect(
    page.getByText("Send this message to +15550001111:", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^Or send this message/)).toHaveCount(0);
  await page.getByRole("button", { name: "Get a new connection code" }).click();
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveValue(`connect ${WHATSAPP_CODES[1].code}`);
  await expect(
    page.getByRole("link", { name: "Open WhatsApp" }),
  ).toHaveAttribute("href", WHATSAPP_CODES[1].url);
  await expect(page.getByText(WAITING)).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/whatsapp/link", body: {} },
    { method: "POST", path: "/v1/channels/whatsapp/link", body: {} },
  ]);
});

test("a WhatsApp connection landing ends the wait and clears the spent code", async ({
  page,
}) => {
  const { calls, connections } = await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  await expect(page.getByText(WAITING)).toBeVisible();
  connections.push({
    id: "connection-wa",
    provider: "whatsapp",
    accountLabel: "•••• 1111",
    spaceId: "personal",
    createdAt: "2026-09-08T13:00:00Z",
  });
  await expect(page.getByText("•••• 1111", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(WAITING)).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveCount(0);
  await expect(page.getByRole("img", { name: /^QR code/ })).toHaveCount(0);
  const whatsApp = whatsAppCard(page);
  await expect(whatsApp.getByText("Connected", { exact: true })).toBeVisible();
  await whatsApp.getByRole("button", { name: "Add another number" }).click();
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveValue(`connect ${WHATSAPP_CODES[1].code}`);
  await expect(page.getByText(WAITING)).toBeVisible();
  await expect(
    whatsApp.getByRole("list").getByText("•••• 1111", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([
    { method: "POST", path: "/v1/channels/whatsapp/link", body: {} },
    { method: "POST", path: "/v1/channels/whatsapp/link", body: {} },
  ]);
});

test("a Slack connection landing clears the spent code and the finish line", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ opener: null }) as unknown as Window;
  });
  const { connections } = await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Add another workspace" }).click();
  const finish = page.getByText(
    "Finish connecting in Slack, then return here.",
  );
  await expect(finish).toBeVisible();
  await page
    .getByRole("button", { name: "Already added Houston to Slack?" })
    .click();
  const command = page.getByRole("textbox", {
    name: "Slack connection command",
  });
  await expect(command).toHaveValue("connect ABCD-1234");
  connections.push({
    id: "connection-new",
    provider: "slack",
    accountLabel: "Ada · Elsewhere",
    spaceId: "personal",
    createdAt: "2026-09-08T14:00:00Z",
  });
  await expect(page.getByText("Ada · Elsewhere", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(finish).toHaveCount(0);
  await expect(command).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Already added Houston to Slack?" }),
  ).toBeVisible();
});

test("disconnecting a WhatsApp connection names WhatsApp", async ({ page }) => {
  const { calls } = await mockChannels(page, {
    connections: [
      SLACK_CONNECTION,
      {
        id: "connection-wa",
        provider: "whatsapp",
        accountLabel: "•••• 1111",
        spaceId: "personal",
        createdAt: "2026-09-08T13:00:00Z",
      },
    ],
  });
  await openChannels(page);
  await expect(page.getByText("•••• 1111", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect •••• 1111" }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", { name: "Disconnect WhatsApp?" }),
  ).toBeVisible();
  await expect(confirmation).toContainText(
    "•••• 1111 will stop getting replies from Houston in WhatsApp.",
  );
  await confirmation
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(page.getByText("•••• 1111", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Ada · Houston team", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([
    {
      method: "DELETE",
      path: "/v1/channels/connections/connection-wa",
      body: null,
    },
  ]);
});

test("a new WhatsApp code waits until a disconnect settles", async ({
  page,
}) => {
  await mockChannels(page, {
    connections: [
      {
        id: "connection-wa",
        provider: "whatsapp",
        accountLabel: "•••• 1111",
        spaceId: "personal",
        createdAt: "2026-09-08T13:00:00Z",
      },
    ],
  });
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/v1/channels/connections/**", async (route) => {
    await answered;
    await route.fallback();
  });
  await openChannels(page);
  await page.getByRole("button", { name: "Disconnect •••• 1111" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(page.getByText("•••• 1111", { exact: true })).toHaveCount(0);
  const connect = page.getByRole("button", { name: "Connect WhatsApp" });
  await expect(connect).toBeDisabled();
  answer();
  await expect(connect).toBeEnabled();
});

test("a deployment that lists no known provider says channels are unavailable", async ({
  page,
}) => {
  await mockChannels(page, { connections: [] });
  await page.route("**/v1/channels", (route) =>
    route.fulfill({ json: { providers: [], connections: [] } }),
  );
  await openChannels(page);
  await expect(
    page.getByText("Channels are unavailable on this Houston installation."),
  ).toBeVisible();
});

test("WhatsApp that is not set up shows no card while Slack remains connectable", async ({
  page,
}) => {
  await mockChannels(page, { whatsappConfigured: false });
  await openChannels(page);
  await expect(slackCard(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add another workspace" }),
  ).toBeVisible();
  await expect(whatsAppCard(page)).toHaveCount(0);
  await expect(page.getByText(/finish setting up WhatsApp/)).toHaveCount(0);
});

test("WhatsApp that is not set up keeps a number already connected removable", async ({
  page,
}) => {
  await mockChannels(page, {
    whatsappConfigured: false,
    connections: [
      {
        id: "connection-wa",
        provider: "whatsapp",
        accountLabel: "•••• 1111",
        spaceId: "personal",
        createdAt: "2026-09-08T13:00:00Z",
      },
    ],
  });
  await openChannels(page);
  await expect(whatsAppCard(page)).toBeVisible();
  await expect(page.getByText(/finish setting up WhatsApp/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disconnect •••• 1111" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add another number" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect •••• 1111" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Disconnect", exact: true })
    .click();
  await expect(whatsAppCard(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Channels", exact: true }),
  ).toBeFocused();
});

test("unconfigured Slack gives setup guidance while retaining disconnect", async ({
  page,
}) => {
  await mockChannels(page, { slackConfigured: false });
  await openChannels(page);
  await expect(page.getByText(/Ask your Houston administrator/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Slack", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Disconnect Ada · Houston team" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add another workspace" }),
  ).toHaveCount(0);
  await expect(slackCard(page)).toBeVisible();
  await expect(
    slackCard(page).getByText("Connected", { exact: true }),
  ).toHaveCount(0);
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
  const { calls } = await mockChannels(page);
  await signInAsViewer(page);
  await page.goto(`${AUTH_WEB_URL}/?settings=channels&slack=${TICKET}`);
  await expect(page.getByText("Ada · Personal", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?settings=channels$/);
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

test("a ticket redeemed during the first list read still shows its connection", async ({
  page,
}) => {
  await mockChannels(page, { holdFirstListUntilRedeemed: true });
  await signInAsViewer(page);
  await page.goto(`${AUTH_WEB_URL}/?settings=channels&slack=${TICKET}`);
  await expect(page.getByText("Ada · Personal", { exact: true })).toBeVisible();
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
