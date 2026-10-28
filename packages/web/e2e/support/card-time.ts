/**
 * Seeds and measures for the board card's time label (HOU-165): one card per
 * label bucket and column, each bucket at its widest label, and the geometry
 * a fit or a layout shift shows up in.
 */
import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import { BOOT_TIMEOUT } from "../config";
import { seedLocale } from "./billing-choice";
import { expect } from "./fixtures";

export const NOW = new Date("2026-10-28T23:30:00Z");
// The widest clock, the widest date this year (pt "10 de ago.") and the widest
// month and year (pt "ago. de 2025").
export const BUCKETS = {
  now: "2026-10-28T23:29:50Z",
  clock: "2026-10-28T11:58:00Z",
  yesterday: "2026-10-27T12:00:00Z",
  weekday: "2026-10-25T12:00:00Z",
  thisYear: "2026-08-10T12:00:00Z",
  pastYear: "2025-08-31T12:00:00Z",
} as const;
export type Bucket = keyof typeof BUCKETS;
export type Locale = "en" | "es" | "pt";
export const BUCKET_NAMES = Object.keys(BUCKETS) as Bucket[];
// A past-year card's label is the longest of these that fits its slot.
export const LABELS: Record<Locale, Record<Bucket, string[]>> = {
  en: {
    now: ["Now"],
    clock: ["11:58 AM"],
    yesterday: ["Yesterday"],
    weekday: ["Sun"],
    thisYear: ["Aug 10"],
    pastYear: ["Aug 2025", "8/2025", "2025"],
  },
  es: {
    now: ["Ahora"],
    clock: ["11:58"],
    yesterday: ["Ayer"],
    weekday: ["dom"],
    thisYear: ["10 ago"],
    pastYear: ["ago 2025", "8/2025", "2025"],
  },
  pt: {
    now: ["Agora"],
    clock: ["11:58"],
    yesterday: ["Ontem"],
    weekday: ["dom"],
    thisYear: ["10 de ago."],
    pastYear: ["ago. de 2025", "08/2025", "2025"],
  },
};
/** Card widths on main before HOU-165 (measured with this seed at 900px tall),
 *  by window width and chat state. Cards must keep them: a narrower card wraps
 *  more titles. */
export const MAIN_CARD_WIDTH: Record<number, { open: number; closed: number }> =
  {
    1280: { open: 168, closed: 302.671875 },
    1440: { open: 180.546875, closed: 356 },
    1920: { open: 268.546875, closed: 516 },
  };
// Running cards carry rename + delete; Needs you adds approve, Done archive.
export const STATUSES = ["running", "needs_you", "done"] as const;

export interface Fit {
  text: string;
  textWidth: number;
  timeLeft: number;
  boxWidth: number;
  scrollWidth: number;
  clientWidth: number;
  cardWidth: number;
  height: number;
  rowHeight: number;
}

export function measure(card: Locator): Promise<Fit> {
  return card.evaluate((el) => {
    const row = el.firstElementChild as HTMLElement;
    const time = row.querySelector("time") as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(time);
    const box = time.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    return {
      text: time.textContent ?? "",
      textWidth: range.getBoundingClientRect().width,
      timeLeft: box.left - frame.left,
      boxWidth: box.width,
      scrollWidth: time.scrollWidth,
      clientWidth: time.clientWidth,
      cardWidth: frame.width,
      height: frame.height,
      rowHeight: row.getBoundingClientRect().height,
    };
  });
}

/** The label shows whole, and nothing about the card moved from `rest`.
 *  Sub-pixel tolerance: the running card's animated border lands its box a
 *  hair off a whole pixel between reads. */
export function expectSteady(fit: Fit, rest: Fit, where: string) {
  const detail = `${where}: "${fit.text}" ${fit.textWidth.toFixed(1)}px in ${fit.boxWidth.toFixed(1)}px`;
  expect.soft(fit.scrollWidth, detail).toBeLessThanOrEqual(fit.clientWidth);
  expect.soft(fit.textWidth, detail).toBeLessThanOrEqual(fit.boxWidth + 0.01);
  expect
    .soft(fit.rowHeight, `${where}: top row on one line`)
    .toBeCloseTo(24, 1);
  for (const key of ["height", "timeLeft", "boxWidth"] as const)
    expect.soft(fit[key], `${where}: ${key}`).toBeCloseTo(rest[key], 1);
}

export async function seedCards(page: Page, extraDone = 0) {
  const post = (data: Record<string, string>) =>
    page.request
      .post(`${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`, { data })
      .then((res) => expect(res.ok()).toBe(true));
  for (const status of STATUSES)
    for (const [bucket, at] of Object.entries(BUCKETS))
      await post({
        id: `${bucket}-${status}`,
        title: `${bucket} ${status}`,
        status,
        last_message_at: at,
      });
  for (let i = 0; i < extraDone; i++)
    await post({
      id: `filler-${i}`,
      title: `filler ${i}`,
      status: "done",
      last_message_at: `2025-0${(i % 9) + 1}-15T12:00:00Z`,
    });
}

export const card = (page: Page, id: string) =>
  page.locator(`[data-kanban-card="${id}"]`);

export async function openBoard(
  page: Page,
  { locale, width, chat }: { locale: Locale; width: number; chat: boolean },
  extraDone = 0,
) {
  if (locale !== "en") await seedLocale(page, locale);
  await page.clock.setFixedTime(NOW);
  await seedCards(page, extraDone);
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await expect(card(page, "now-done")).toBeVisible({ timeout: BOOT_TIMEOUT });
  if (chat) {
    await card(page, "act-1").click();
    await expect(page.getByRole("textbox").last()).toBeVisible();
  }
  await page.mouse.move(0, 0);
  // The board reflows a frame after the panel lands: wait for steady widths.
  let last = -1;
  await expect(async () => {
    const w = await card(page, "now-done").evaluate((el) => el.clientWidth);
    const settled = w === last;
    last = w;
    expect(settled).toBe(true);
  }).toPass();
}
