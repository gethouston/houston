import {
  mockChannels,
  openChannels,
  slackCard,
  WHATSAPP_CODES,
} from "../support/channels";
import { expect, test } from "../support/fixtures";
import { AUTH_WEB_URL } from "../support/identity";

test.use({ baseURL: AUTH_WEB_URL });

test("a connected card stacks its status, its accounts, and the way to add one", async ({
  page,
}) => {
  await mockChannels(page);
  await openChannels(page);
  const slack = slackCard(page);
  await expect(slack.getByText("Connected", { exact: true })).toBeVisible();
  const add = slack.getByRole("button", { name: "Add another workspace" });
  const disconnect = slack.getByRole("button", {
    name: "Disconnect Ada · Houston team",
  });
  await expect(add).toBeVisible();
  const [addBox, disconnectBox] = await Promise.all([
    add.boundingBox(),
    disconnect.boundingBox(),
  ]);
  expect(addBox?.height).toBeGreaterThanOrEqual(44);
  expect(disconnectBox?.height).toBeGreaterThanOrEqual(44);
  await disconnect.tap();
  await expect(
    page.getByRole("alertdialog").getByRole("heading", {
      name: "Disconnect Slack?",
    }),
  ).toBeVisible();
});

test("Open WhatsApp spans the phone and the command waits behind a disclosure", async ({
  page,
}) => {
  await mockChannels(page);
  await openChannels(page);
  await page.getByRole("button", { name: "Connect WhatsApp" }).tap();

  const open = page.getByRole("link", { name: "Open WhatsApp" });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", WHATSAPP_CODES[0].url);
  await expect(open).toHaveAttribute("target", "_blank");
  const [link, column] = await Promise.all([
    open.boundingBox(),
    open.locator("..").boundingBox(),
  ]);
  expect(link?.width).toBe(column?.width);
  await expect(
    page.getByText("Your code is ready in the message. Just press send."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR code/ })).toHaveCount(0);

  const command = page.getByRole("textbox", {
    name: "WhatsApp connection command",
  });
  await expect(command).toHaveCount(0);
  await page.getByText("Prefer to type it? Show number and command").tap();
  await expect(
    page.getByText("Send this message to +15550001111:", { exact: true }),
  ).toBeVisible();
  await expect(command).toHaveValue(`connect ${WHATSAPP_CODES[0].code}`);
  await expect(page.getByText("Waiting for your message…")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
