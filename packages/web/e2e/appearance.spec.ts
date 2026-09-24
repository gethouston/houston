import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettings } from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * Settings > Appearance: the mode the app runs in, and the palette each mode
 * wears.
 *
 * Three independent choices (`app/src/lib/theme-model.ts`) collapse into the
 * one pair `<html>` paints — `data-theme` for the resolved mode, `data-palette`
 * for the palette of that mode — so every assertion here reads those two
 * attributes rather than pixels. What each test defends:
 *
 * 1. the section offers all three modes and one swatch row per mode, Houston's
 *    own palette leading each;
 * 2. a dark palette paints the moment dark is the mode, and SURVIVES a reload —
 *    the device mirror (`houston.theme.cache`) repaints it on the first frame,
 *    long before the engine preference read answers;
 * 3. `system` tracks the OS appearance live, in both directions;
 * 4. the arrow keys walk a row, which is the whole keyboard contract of a radio
 *    group.
 *
 * Preferences: `theme`, `theme.light` and `theme.dark` are DEVICE keys, so the
 * adapter stores them in this tab's localStorage (`houston.pref.*`) and the fake
 * host needs no route of its own. The theme is per-context state and Playwright
 * gives every test a fresh context, so nothing leaks between tests.
 */

/** The palette Houston ships as the dark default, and the one this spec picks. */
const HOUSTON_DARK = "Houston Dark";
const NORD = "Nord";

/** Every shipped palette of one mode, as the rows paint them. */
const LIGHT_PALETTES = 6;
const DARK_PALETTES = 6;

function html(page: Page): Locator {
  return page.locator("html");
}

/** One segment of the mode control. Scoped to the fieldset, which its sr-only
 *  legend names, so "Dark" cannot match the "Dark palette" row below it. */
function modeSegment(page: Page, name: string): Locator {
  return screen(page)
    .getByRole("group", { name: "Appearance" })
    .getByRole("button", { name, exact: true });
}

/** A mode's swatch row, named by the row's own title. */
function paletteRow(page: Page, name: string): Locator {
  return screen(page).getByRole("radiogroup", { name });
}

function swatch(page: Page, row: string, palette: string): Locator {
  return paletteRow(page, row).getByRole("radio", { name: palette });
}

async function openAppearance(page: Page): Promise<void> {
  await page.goto("/");
  await openSettings(page);
  await expect(modeSegment(page, "Light")).toBeVisible();
}

test("Appearance offers three modes and one palette row per mode", async ({
  page,
}) => {
  await openAppearance(page);

  for (const mode of ["Light", "Dark", "System"]) {
    await expect(modeSegment(page, mode)).toBeVisible();
  }

  await expect(
    paletteRow(page, "Light palette").getByRole("radio"),
  ).toHaveCount(LIGHT_PALETTES);
  await expect(paletteRow(page, "Dark palette").getByRole("radio")).toHaveCount(
    DARK_PALETTES,
  );

  // Houston's own set leads each row, and is what an untouched install wears.
  await expect(
    paletteRow(page, "Light palette").getByRole("radio").first(),
  ).toHaveAccessibleName("Houston Light");
  await expect(
    paletteRow(page, "Dark palette").getByRole("radio").first(),
  ).toHaveAccessibleName(HOUSTON_DARK);
  await expect(swatch(page, "Light palette", "Houston Light")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(swatch(page, "Dark palette", HOUSTON_DARK)).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("a dark palette paints under dark mode and survives a reload", async ({
  page,
}) => {
  await openAppearance(page);

  await modeSegment(page, "Dark").click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-palette", "houston-dark");

  await swatch(page, "Dark palette", NORD).click();
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(swatch(page, "Dark palette", NORD)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Choosing a LIGHT palette while dark is on screen is a valid, silent pick:
  // the row is dimmed, never disabled, and nothing repaints.
  await swatch(page, "Light palette", "Catppuccin Latte").click();
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.reload();
  // The mirror, not the engine: this holds from the first frame.
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await openSettings(page);
  await expect(swatch(page, "Dark palette", NORD)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    swatch(page, "Light palette", "Catppuccin Latte"),
  ).toHaveAttribute("aria-checked", "true");
});

test("System follows the OS appearance in both directions", async ({
  page,
}) => {
  await openAppearance(page);

  await modeSegment(page, "System").click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-palette", "houston-dark");

  // Light is the document default, carried by the attribute being ABSENT.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
  await expect(html(page)).toHaveAttribute("data-palette", "houston-light");

  // An explicit mode is immune to the OS: the watcher is gated on `system`.
  await modeSegment(page, "Dark").click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("the arrow keys walk a swatch row and wrap at its ends", async ({
  page,
}) => {
  await openAppearance(page);
  await modeSegment(page, "Dark").click();

  // The row is ONE tab stop: the checked swatch holds it, the arrows move both
  // the selection and the focus.
  await swatch(page, "Dark palette", HOUSTON_DARK).focus();
  await page.keyboard.press("ArrowRight");
  const second = paletteRow(page, "Dark palette").getByRole("radio").nth(1);
  await expect(second).toHaveAttribute("aria-checked", "true");
  await expect(second).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(swatch(page, "Dark palette", HOUSTON_DARK)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Wraps: one step back from the first lands on the last.
  await page.keyboard.press("ArrowLeft");
  const last = paletteRow(page, "Dark palette").getByRole("radio").last();
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(last).toBeFocused();
});
