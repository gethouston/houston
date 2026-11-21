import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { missionCard } from "./support/team-nav";

const PROBE_HOLD_MS = 20_000;
const SEND_GRACE_MS = 5_000;

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((s) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => s,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => s === "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("a send after the app returns from the background goes out at once", async ({
  page,
  context,
  emitHostEvent,
}) => {
  const pinTimeouts: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("chat.send-pin-settle")) pinTimeouts.push(m.text());
  });
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await page.route(/\/providers(\?|$)/, async (route) => {
    await new Promise((r) => setTimeout(r, PROBE_HOLD_MS));
    await route.continue().catch(() => {});
  });

  await setVisibility(page, "hidden");
  await context.setOffline(true);
  await context.setOffline(false);
  await setVisibility(page, "visible");
  await expect(async () => {
    const catalogReread = page.waitForResponse(/\/v1\/catalog$/, {
      timeout: 2_000,
    });
    await emitHostEvent("EventStreamReconnected");
    await catalogReread;
  }).toPass({ timeout: 15_000 });

  const sent = page.waitForRequest(
    (r) =>
      r.method() === "POST" &&
      /\/conversations\//.test(r.url()) &&
      !r.url().endsWith("/prewarm"),
  );
  const started = Date.now();
  await composer.fill("back from the background");
  await composer.press("Enter");
  await sent;

  expect(Date.now() - started).toBeLessThan(SEND_GRACE_MS);
  expect(pinTimeouts).toEqual([]);
});
