/**
 * Every compact time label shows in full on a board card (HOU-165): at every
 * board width, chat open or closed, in en, es and pt, for every label bucket,
 * column action set and card state. The narrowest case is a 180px column (1280
 * window, chat open). Revealing the select checkbox on hover, focus or a
 * selection must not move the label, resize it or change the card's height.
 * board-card-scroll.spec.ts covers a column long enough to scroll.
 *
 * Assertions, not screenshots: the label's text width against its box, its
 * position and box against the resting card, and the card's width and height.
 */
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

// One boot per locale, width and chat state, shared by one test per column: a
// boot plus every bucket and state of all three columns outran the 30s test
// budget on a slow CI runner, and a boot per column made the job 50% longer.
for (const locale of ["en", "es", "pt"] as const)
  for (const width of [1280, 1440, 1920])
    for (const chat of [false, true])
      test.describe(`card time fits: ${locale} ${width}px chat ${chat ? "open" : "closed"}`, () => {
        test.describe.configure({ mode: "serial" });
        let context: BrowserContext | undefined;
        let page: Page;

        // beforeAll gets no `page` fixture. The runner fills the project's
        // context options (and this file's `test.use`) into a context made
        // here too, so only the fresh fake host and the boot seed are ours.
        test.beforeAll(async ({ browser, fakeHost }) => {
          context = await browser.newContext({
            viewport: { width, height: 900 },
          });
          page = await context.newPage();
          await context.request.post(`${fakeHost.url}/__test__/reset`);
          await seedPage(page);
          await openBoard(page, { locale, width, chat });
        });
        test.afterAll(async () => {
          await context?.close();
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
            // One checked card puts every card of its column in selection mode.
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
            // The next column measures this page at rest, and a selection
            // hides every other column's checkbox.
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
  // Widen only the past-year labels, as a wider platform font would.
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
