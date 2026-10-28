/**
 * Every compact time label shows in full on a board card (HOU-165): at every
 * board width, chat open or closed, in en, es and pt, for every label bucket,
 * column icon set and card state. The narrowest case is a 180px column (1280
 * window, chat open), where three inline 24px actions used to leave the label
 * 46px and "Yesterday", "11:58 AM", "10 de ago." and every past-year date
 * ellipsized. Revealing the select checkbox on hover, focus or a selection
 * must not narrow the label or change the card's height either.
 *
 * Assertions, not screenshots: the label's text width against its box, the
 * card height against its resting height, and the top row's one-line height.
 */
import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { seedLocale } from "../support/billing-choice";
import { expect, test } from "../support/fixtures";

test.use({ timezoneId: "UTC" });

const NOW = new Date("2026-10-28T23:30:00Z");
// Each bucket at its widest label: the widest clock, the widest date this
// year (pt "10 de ago.") and the widest month and year (pt "ago. de 2025").
const BUCKETS = {
  now: "2026-10-28T23:29:50Z",
  clock: "2026-10-28T11:58:00Z",
  yesterday: "2026-10-27T12:00:00Z",
  weekday: "2026-10-25T12:00:00Z",
  thisYear: "2026-08-10T12:00:00Z",
  pastYear: "2025-08-31T12:00:00Z",
} as const;
type Bucket = keyof typeof BUCKETS;
const LABELS: Record<"en" | "es" | "pt", Record<Bucket, string>> = {
  en: {
    now: "Now",
    clock: "11:58 AM",
    yesterday: "Yesterday",
    weekday: "Sun",
    thisYear: "Aug 10",
    pastYear: "Aug 2025",
  },
  es: {
    now: "Ahora",
    clock: "11:58",
    yesterday: "Ayer",
    weekday: "dom",
    thisYear: "10 ago",
    pastYear: "ago 2025",
  },
  pt: {
    now: "Agora",
    clock: "11:58",
    yesterday: "Ontem",
    weekday: "dom",
    thisYear: "10 de ago.",
    pastYear: "ago. de 2025",
  },
};
// Running cards carry rename + delete; Needs you adds approve, Done archive.
const STATUSES = ["running", "needs_you", "done"] as const;

interface Fit {
  text: string;
  textWidth: number;
  boxWidth: number;
  scrollWidth: number;
  clientWidth: number;
  slot: number;
  height: number;
  rowHeight: number;
}

function measure(card: Locator): Promise<Fit> {
  return card.evaluate((el) => {
    const row = el.firstElementChild as HTMLElement;
    const time = row.querySelector("time") as HTMLElement;
    const actions = row.lastElementChild as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(time);
    const box = time.getBoundingClientRect();
    return {
      text: time.textContent ?? "",
      textWidth: range.getBoundingClientRect().width,
      boxWidth: box.width,
      scrollWidth: time.scrollWidth,
      clientWidth: time.clientWidth,
      slot: actions.getBoundingClientRect().left - box.left,
      height: el.getBoundingClientRect().height,
      rowHeight: row.getBoundingClientRect().height,
    };
  });
}

function expectFits(fit: Fit, rest: Fit, where: string) {
  const detail = `${where}: "${fit.text}" ${fit.textWidth.toFixed(1)}px in ${fit.boxWidth.toFixed(1)}px (slot ${fit.slot.toFixed(1)}px)`;
  expect.soft(fit.scrollWidth, detail).toBeLessThanOrEqual(fit.clientWidth);
  expect.soft(fit.textWidth, detail).toBeLessThanOrEqual(fit.boxWidth + 0.01);
  // Sub-pixel: the running card's animated border lands its height a hair
  // off a whole pixel between reads.
  expect.soft(fit.height, `${where}: card height`).toBeCloseTo(rest.height, 1);
  expect.soft(fit.rowHeight, `${where}: top row on one line`).toBe(24);
}

async function seedCards(page: Page) {
  for (const status of STATUSES)
    for (const [bucket, at] of Object.entries(BUCKETS)) {
      const res = await page.request.post(
        `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`,
        {
          data: {
            id: `${bucket}-${status}`,
            title: `${bucket} ${status}`,
            status,
            last_message_at: at,
          },
        },
      );
      expect(res.ok()).toBe(true);
    }
}

for (const locale of ["en", "es", "pt"] as const)
  for (const width of [1280, 1440, 1920])
    for (const chat of [false, true])
      test(`card time fits: ${locale} ${width}px chat ${chat ? "open" : "closed"}`, async ({
        page,
      }) => {
        if (locale !== "en") await seedLocale(page, locale);
        await page.clock.setFixedTime(NOW);
        await seedCards(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        const card = (id: string) => page.locator(`[data-kanban-card="${id}"]`);
        await expect(card("now-done")).toBeVisible();
        if (chat) {
          await card("act-1").click();
          await expect(page.getByRole("textbox").last()).toBeVisible();
        }
        await page.mouse.move(0, 0);
        // Reduced motion leaves the panel's final width immediately, but the
        // board reflows a frame later: wait until the card widths settle.
        let last = -1;
        await expect(async () => {
          const w = await card("now-done").evaluate((el) => el.clientWidth);
          const settled = w === last;
          last = w;
          expect(settled).toBe(true);
        }).toPass();

        const ids = STATUSES.flatMap((s) =>
          (Object.keys(BUCKETS) as Bucket[]).map((b) => [b, s] as const),
        );
        const rest = new Map<string, Fit>();
        const restOf = (id: string) => {
          const fit = rest.get(id);
          if (!fit) throw new Error(`no resting measure for ${id}`);
          return fit;
        };
        for (const [bucket, status] of ids) {
          const id = `${bucket}-${status}`;
          const fit = await measure(card(id));
          expect.soft(fit.text, id).toBe(LABELS[locale][bucket]);
          rest.set(id, fit);
          expectFits(fit, fit, `${id} rest`);
        }
        for (const [bucket, status] of ids) {
          const id = `${bucket}-${status}`;
          await card(id).hover({ position: { x: 40, y: 50 } });
          expectFits(await measure(card(id)), restOf(id), `${id} hover`);
          await page.mouse.move(0, 0);
          await card(id).focus();
          expectFits(await measure(card(id)), restOf(id), `${id} focus`);
          await card(id).blur();
        }
        for (const status of STATUSES) {
          // One checked card puts every card of its column in selection mode.
          const first = card(`now-${status}`);
          await first.hover({ position: { x: 40, y: 50 } });
          await first.getByRole("checkbox").check();
          await page.mouse.move(0, 0);
          for (const bucket of Object.keys(BUCKETS) as Bucket[]) {
            const id = `${bucket}-${status}`;
            expectFits(await measure(card(id)), restOf(id), `${id} selected`);
          }
          await first.hover({ position: { x: 40, y: 50 } });
          await first.getByRole("checkbox").uncheck();
        }
      });
