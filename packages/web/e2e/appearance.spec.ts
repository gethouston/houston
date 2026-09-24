import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettings } from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * Settings > Appearance: ONE row for the whole look of the app — a menu for the
 * mode, and Customize for the palette each mode wears.
 *
 * Three independent choices (`app/src/lib/theme-model.ts`) collapse into the one
 * pair `<html>` paints — `data-theme` for the resolved mode, `data-palette` for
 * the palette of that mode — so every assertion here reads those two attributes
 * rather than pixels. What each test defends:
 *
 * 1. the row offers the mode menu and Customize, and says the current state in
 *    words;
 * 2. the menu changes the mode immediately;
 * 3. Customize opens Palettes, a pick there paints at once and SURVIVES a
 *    reload — the device mirror (`houston.theme.cache`) repaints it on the FIRST
 *    frame, which {@link recordFirstFrame} proves rather than infers, long before
 *    the engine preference read answers — and the X closes the dialog with
 *    nothing to confirm;
 * 4. `system` tracks the OS appearance live, in both directions;
 * 5. the arrow keys walk a section, which is the whole keyboard contract of a
 *    radio group.
 *
 * Preferences: `theme`, `theme.light` and `theme.dark` are DEVICE keys, so the
 * adapter stores them in this tab's localStorage (`houston.pref.*`) and the fake
 * host needs no route of its own. The theme is per-context state and Playwright
 * gives every test a fresh context, so nothing leaks between tests.
 */

/** The palettes Houston ships as defaults, and the one this spec picks. */
const HOUSTON_LIGHT = "Houston Light";
const HOUSTON_DARK = "Houston Dark";
const NORD = "Nord";

/** Every shipped palette of one mode, as a section paints them. */
const LIGHT_PALETTES = 6;
const DARK_PALETTES = 6;

function html(page: Page): Locator {
  return page.locator("html");
}

/** What `<html>` wore the moment something first painted it. */
interface FirstFrame {
  /** `"loading"` is the proof: the document was still parsing, so no module ran. */
  readyState: DocumentReadyState;
  theme: string | null;
  palette: string | null;
  background: string;
}

type CapturingWindow = Window & { __houstonFirstFrame?: FirstFrame };

/**
 * Capture the FIRST frame's theme, for every navigation from here on.
 *
 * Reading the attributes after a reload cannot prove the pre-paint script in
 * index.html painted them: the preference read repairs the same two attributes a
 * moment later, so an assertion that merely waits would pass on a repair and a
 * broken first frame alike. The observer below is registered at document-start,
 * before `<html>` exists (hence observing `document`, not `documentElement`), and
 * its callback runs at the microtask checkpoint that follows the parser-blocking
 * pre-paint script — the first attribute write in the document, and the last one
 * before the deferred app bundle executes. `readyState` is recorded with it so
 * the assertion can state that provenance instead of assuming it.
 */
async function recordFirstFrame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const self = window as CapturingWindow;
      if (self.__houstonFirstFrame) return;
      const el = document.documentElement;
      self.__houstonFirstFrame = {
        readyState: document.readyState,
        theme: el.getAttribute("data-theme"),
        palette: el.getAttribute("data-palette"),
        background: el.style.background,
      };
    }).observe(document, { attributes: true, subtree: true });
  });
}

async function firstFrame(page: Page): Promise<FirstFrame> {
  const captured = await page.evaluate(
    () => (window as CapturingWindow).__houstonFirstFrame ?? null,
  );
  if (captured === null) {
    throw new Error(
      "nothing painted <html> before the app bundle ran: there was no themed first frame",
    );
  }
  return captured;
}

/** The mode menu, named by the row it sits in. */
function modeMenu(page: Page): Locator {
  return screen(page).getByRole("combobox", { name: "Appearance" });
}

/** Pick a mode: the menu's options are portalled, hence the page-level lookup. */
async function chooseMode(page: Page, name: string): Promise<void> {
  await modeMenu(page).click();
  await page.getByRole("option", { name, exact: true }).click();
}

function customize(page: Page): Locator {
  return screen(page).getByRole("button", { name: "Customize" });
}

function palettesDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Palettes" });
}

/** A mode's tiles, named by the section heading above them ("Light" / "Dark"). */
function paletteSection(page: Page, name: string): Locator {
  return palettesDialog(page).getByRole("radiogroup", { name, exact: true });
}

function tile(page: Page, section: string, palette: string): Locator {
  return paletteSection(page, section).getByRole("radio", { name: palette });
}

async function openAppearance(page: Page): Promise<void> {
  await page.goto("/");
  await openSettings(page);
  await expect(modeMenu(page)).toBeVisible();
}

async function openPalettes(page: Page): Promise<void> {
  await customize(page).click();
  await expect(palettesDialog(page)).toBeVisible();
}

test("the Appearance row offers the mode menu, Customize, and the state in words", async ({
  page,
}) => {
  await openAppearance(page);

  await expect(customize(page)).toBeVisible();
  // An untouched install: light mode, Houston's own palette on each side.
  await expect(modeMenu(page)).toHaveText("Light");
  await expect(
    screen(page).getByText(`Light · ${HOUSTON_LIGHT} / ${HOUSTON_DARK}`),
  ).toBeVisible();

  await openPalettes(page);
  await expect(paletteSection(page, "Light").getByRole("radio")).toHaveCount(
    LIGHT_PALETTES,
  );
  await expect(paletteSection(page, "Dark").getByRole("radio")).toHaveCount(
    DARK_PALETTES,
  );

  // Houston's own set leads each section, and is what an untouched install wears.
  await expect(
    paletteSection(page, "Light").getByRole("radio").first(),
  ).toHaveAccessibleName(HOUSTON_LIGHT);
  await expect(
    paletteSection(page, "Dark").getByRole("radio").first(),
  ).toHaveAccessibleName(HOUSTON_DARK);
  await expect(tile(page, "Light", HOUSTON_LIGHT)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(tile(page, "Dark", HOUSTON_DARK)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Nothing to confirm: the X is the only way out, and the picks are saved.
  await palettesDialog(page).getByRole("button", { name: "Close" }).click();
  await expect(palettesDialog(page)).toHaveCount(0);
});

test("the mode menu repaints the app at once", async ({ page }) => {
  await openAppearance(page);

  await chooseMode(page, "Dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-palette", "houston-dark");

  // Light is the document default, carried by the attribute being ABSENT.
  await chooseMode(page, "Light");
  await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
  await expect(html(page)).toHaveAttribute("data-palette", "houston-light");
});

test("a dark palette paints under dark mode and survives a reload", async ({
  page,
}) => {
  await openAppearance(page);
  await chooseMode(page, "Dark");
  await openPalettes(page);

  await tile(page, "Dark", NORD).click();
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(tile(page, "Dark", NORD)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Choosing a LIGHT palette while dark is on screen is a valid, silent pick:
  // the section is hinted, never disabled, and nothing repaints.
  await tile(page, "Light", "Catppuccin Latte").click();
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  // The gutter the pick put on `<html>`, as THIS browser serializes it: the
  // reload's first frame has to be wearing the very same one.
  const gutter = await page.evaluate(
    () => document.documentElement.style.background,
  );
  expect(gutter).not.toBe("");

  // Picks persist through a short debounce; a reload before the store holds
  // them would test the debounce, not the reload.
  await expect
    .poll(() =>
      page.evaluate(() => [
        localStorage.getItem("houston.pref.theme"),
        localStorage.getItem("houston.pref.theme.dark"),
        localStorage.getItem("houston.pref.theme.light"),
      ]),
    )
    .toEqual(["dark", "nord", "catppuccin-latte"]);

  await recordFirstFrame(page);
  await page.reload();
  // The mirror, not the engine: the pick is already painted on the frame the
  // pre-paint script produced, while the document was still parsing.
  expect(await firstFrame(page)).toEqual({
    readyState: "loading",
    theme: "dark",
    palette: "nord",
    background: gutter,
  });
  // ...and the preference read that lands after it agrees, so nothing flashes.
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await openSettings(page);
  await expect(
    screen(page).getByText(`Dark · Catppuccin Latte / ${NORD}`),
  ).toBeVisible();
  await openPalettes(page);
  await expect(tile(page, "Dark", NORD)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(tile(page, "Light", "Catppuccin Latte")).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("System follows the OS appearance in both directions", async ({
  page,
}) => {
  await openAppearance(page);

  await chooseMode(page, "System");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-palette", "houston-dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).not.toHaveAttribute("data-theme", /.*/);
  await expect(html(page)).toHaveAttribute("data-palette", "houston-light");

  // An explicit mode is immune to the OS: the watcher is gated on `system`.
  await chooseMode(page, "Dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("the arrow keys walk a palette section and wrap at its ends", async ({
  page,
}) => {
  await openAppearance(page);
  await chooseMode(page, "Dark");
  await openPalettes(page);

  // The section is ONE tab stop: the checked tile holds it, the arrows move both
  // the selection and the focus.
  await tile(page, "Dark", HOUSTON_DARK).focus();
  await page.keyboard.press("ArrowRight");
  const second = paletteSection(page, "Dark").getByRole("radio").nth(1);
  await expect(second).toHaveAttribute("aria-checked", "true");
  await expect(second).toBeFocused();

  await page.keyboard.press("ArrowLeft");
  await expect(tile(page, "Dark", HOUSTON_DARK)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Wraps: one step back from the first lands on the last.
  await page.keyboard.press("ArrowLeft");
  const last = paletteSection(page, "Dark").getByRole("radio").last();
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(last).toBeFocused();
});
