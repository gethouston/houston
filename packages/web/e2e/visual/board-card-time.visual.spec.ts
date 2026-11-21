import type { BrowserContext, Page } from "@playwright/test";
import {
  BUCKET_NAMES,
  card,
  expectSteady,
  type Fit,
  LABELS,
  MAIN_CARD_WIDTH,
  measure,
  openBoard,
  STATUSES,
} from "../support/card-time";
import { expect, test } from "../support/fixtures";
import { seedPage } from "../support/seed";

test.use({ timezoneId: "UTC" });

for (const locale of ["en", "es", "pt"] as const)
  for (const width of [1280, 1440, 1920])
    for (const chat of [false, true])
      test.describe(`card time fits: ${locale} ${width}px chat ${chat ? "open" : "closed"}`, () => {
        test.describe.configure({ mode: "serial" });
        let context: BrowserContext | undefined;
        let page: Page;
        let failed = false;

        test.beforeAll(async ({ browser, fakeHost }, testInfo) => {
          context = await browser.newContext({
            viewport: { width, height: 900 },
            recordVideo: { dir: testInfo.outputPath("video") },
          });
          page = await context.newPage();
          await context.request.post(`${fakeHost.url}/__test__/reset`);
          await seedPage(page);
          await openBoard(page, { locale, width, chat });
        });
        // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern on a hook's first parameter
        test.afterEach(async ({}, testInfo) => {
          if (testInfo.status !== testInfo.expectedStatus) failed = true;
        });
        // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern on a hook's first parameter
        test.afterAll(async ({}, testInfo) => {
          const video = page?.video();
          await context?.close();
          if (!video) return;
          if (failed)
            await testInfo.attach("video", {
              path: await video.path(),
              contentType: "video/webm",
            });
          else await video.delete();
        });

        for (const status of STATUSES)
          test(status, async () => {
            const rest = new Map<string, Fit>();
            const restOf = (id: string) => {
              const fit = rest.get(id);
              if (!fit) throw new Error(`no resting measure for ${id}`);
              return fit;
            };
            for (const bucket of BUCKET_NAMES) {
              const id = `${bucket}-${status}`;
              const fit = await measure(card(page, id));
              expect.soft(LABELS[locale][bucket], id).toContain(fit.text);
              rest.set(id, fit);
              expectSteady(fit, fit, `${id} rest`);
              expect
                .soft(fit.cardWidth, `${id} width as on main`)
                .toBeCloseTo(
                  MAIN_CARD_WIDTH[width][chat ? "open" : "closed"],
                  1,
                );
            }
            for (const bucket of BUCKET_NAMES) {
              const id = `${bucket}-${status}`;
              await card(page, id).hover({ position: { x: 40, y: 50 } });
              expectSteady(
                await measure(card(page, id)),
                restOf(id),
                `${id} hover`,
              );
              await page.mouse.move(0, 0);
              await card(page, id).focus();
              expectSteady(
                await measure(card(page, id)),
                restOf(id),
                `${id} focus`,
              );
              await card(page, id).blur();
            }
            const checkbox = card(page, `now-${status}`).getByRole("checkbox");
            await card(page, `now-${status}`).hover({
              position: { x: 40, y: 50 },
            });
            await checkbox.check();
            await page.mouse.move(0, 0);
            for (const bucket of BUCKET_NAMES) {
              const id = `${bucket}-${status}`;
              const fit = await measure(card(page, id));
              expectSteady(fit, restOf(id), `${id} selected`);
            }
            await checkbox.uncheck();
            await checkbox.blur();
            await page.mouse.move(0, 0);
            await expect(
              page.getByRole("checkbox", { checked: true }),
            ).toHaveCount(0);
          });
      });

test("a past-year label steps down to a shorter form that fits", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent =
        '[data-kanban-card^="pastYear"] time { letter-spacing: 4px; }';
      document.head.append(style);
    });
  });
  await openBoard(page, { locale: "pt", width: 1280, chat: true });
  const [monthYear, numeric, year] = LABELS.pt.pastYear;
  for (const status of STATUSES) {
    const fit = await measure(card(page, `pastYear-${status}`));
    expect.soft(fit.text, status).not.toBe(monthYear);
    expect.soft([numeric, year], status).toContain(fit.text);
    expectSteady(fit, fit, `pastYear-${status} widened`);
  }
});
