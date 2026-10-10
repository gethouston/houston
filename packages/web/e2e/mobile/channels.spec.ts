import {
  mockChannels,
  openChannels,
  WHATSAPP_CODES,
} from "../support/channels";
import { expect, test } from "../support/fixtures";
import { AUTH_WEB_URL } from "../support/identity";

/**
 * The phone twin of channels-settings.spec.ts: on a phone the person is
 * already holding WhatsApp, so the code arrives as one full-width "Open
 * WhatsApp" link with the message prefilled, and the number and command hide
 * behind a disclosure for typing it by hand. No QR code: there is no second
 * device to scan with.
 */

test.use({ baseURL: AUTH_WEB_URL });

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
  // Full width: the link spans the column it sits in.
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
