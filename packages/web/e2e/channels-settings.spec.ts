import {
  mockChannels,
  openChannels,
  SLACK_CONNECTION,
  WHATSAPP_CODES,
} from "./support/channels";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, signInAsViewer } from "./support/identity";

test.use({ baseURL: AUTH_WEB_URL });

const TICKET = "Tk7-ticket.value_~9";
const WAITING = "Waiting for your message…";

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
    page
      .getByText("Connect a messaging account to message Houston directly.")
      .first(),
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
  // The code the phone scans is the very link the button opens.
  await expect(qr).toHaveAttribute("data-qr-value", WHATSAPP_CODES[0].url);
  await expect(
    page.getByRole("textbox", { name: "WhatsApp connection command" }),
  ).toHaveValue(`connect ${WHATSAPP_CODES[0].code}`);
  await expect(
    page.getByText("Or send this message to +15550001111:"),
  ).toBeVisible();
  // A real link, so no popup blocker stands between the click and WhatsApp.
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
  // Nothing left to send: no QR, no link, no wait, and no dangling "Or".
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
  const { connections } = await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Connect WhatsApp" }).click();
  await expect(page.getByText(WAITING)).toBeVisible();
  // The person sends the message from their phone: the gateway binds it and
  // nothing tells this tab, so the list's own poll has to find it.
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
  await expect(
    page.getByRole("button", { name: "Connect WhatsApp" }),
  ).toBeVisible();
});

test("a Slack connection landing clears the spent code and the finish line", async ({
  page,
}) => {
  // The browser takes the authorization page: stubbed, so no real tab opens
  // and the section says "finish in Slack" rather than "blocked".
  await page.addInitScript(() => {
    window.open = () => ({ opener: null }) as unknown as Window;
  });
  const { connections } = await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Connect Slack" }).click();
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
  // The authorization finished in the other tab: nothing tells this one.
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
  await page
    .getByRole("button", { name: "Disconnect", exact: true })
    .nth(1)
    .click();
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
  // The row leaves on the click, before the gateway answers. A code minted
  // in that window would record the ids without the removed account, so a
  // refused disconnect's rollback would read as a connection landing.
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route("**/v1/channels/connections/**", async (route) => {
    await answered;
    await route.fallback();
  });
  await openChannels(page);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
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

test("unconfigured WhatsApp keeps its own guidance while Slack remains connectable", async ({
  page,
}) => {
  await mockChannels(page, { whatsappConfigured: false });
  await openChannels(page);
  await expect(page.getByText(/finish setting up WhatsApp/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect WhatsApp" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect Slack" }),
  ).toBeVisible();
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
  const { calls } = await mockChannels(page);
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

test("a ticket redeemed during the first list read still shows its connection", async ({
  page,
}) => {
  // The first list read was answered before the redemption and arrives after
  // it: the redemption must trigger a read of its own, not ride the stale one.
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
