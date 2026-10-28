/**
 * A board column long enough to scroll keeps its cards as wide as a column
 * that doesn't (HOU-165). The styled scrollbar takes layout width, so without
 * a reserved gutter a Done column of a dozen cards at 1280 with the chat open
 * narrowed every card by 6px and clipped labels sized for the full width.
 * Scrollbars are shown here: Playwright's Chromium hides them by default,
 * which would hide the bug. Also runs on WebKit (`test:e2e:webkit`), the
 * desktop app's engine.
 */
import {
  BUCKET_NAMES,
  card,
  expectSteady,
  MAIN_CARD_WIDTH,
  measure,
  openBoard,
} from "./support/card-time";
import { expect, test } from "./support/fixtures";

test.use({
  timezoneId: "UTC",
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

test("a scrolling column keeps its cards as wide as the rest", async ({
  page,
}) => {
  await openBoard(page, { locale: "pt", width: 1280, chat: true }, 12);
  const list = card(page, "filler-0").locator(
    "xpath=ancestor::div[contains(@class,'overflow-y-')][1]",
  );
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const reference = await measure(card(page, "now-running"));
  expect(reference.cardWidth).toBeCloseTo(MAIN_CARD_WIDTH[1280].open, 1);
  for (const id of [
    ...BUCKET_NAMES.map((b) => `${b}-done`),
    ...Array.from({ length: 12 }, (_, i) => `filler-${i}`),
  ]) {
    const fit = await measure(card(page, id));
    expect
      .soft(fit.cardWidth, `${id} width`)
      .toBeCloseTo(reference.cardWidth, 1);
    expectSteady(fit, fit, `${id} in a scrolling column`);
  }
});
