import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openSettings } from "./support/settings-nav";
import { screen } from "./support/team-nav";

const HOUSTON_LIGHT = "Houston Light";
const HOUSTON_DARK = "Houston Dark";
const NORD = "Nord";

const LIGHT_PALETTES = 6;
const DARK_PALETTES = 6;

function html(page: Page): Locator {
  return page.locator("html");
}

interface FirstFrame {
  readyState: DocumentReadyState;
  theme: string | null;
  palette: string | null;
  background: string;
}

type CapturingWindow = Window & { __houstonFirstFrame?: FirstFrame };

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

function modeMenu(page: Page): Locator {
  return screen(page).getByRole("combobox", { name: "Appearance" });
}

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

  await palettesDialog(page).getByRole("button", { name: "Close" }).click();
  await expect(palettesDialog(page)).toHaveCount(0);
});

test("the mode menu repaints the app at once", async ({ page }) => {
  await openAppearance(page);

  await chooseMode(page, "Dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(html(page)).toHaveAttribute("data-palette", "houston-dark");

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

  await tile(page, "Light", "Catppuccin Latte").click();
  await expect(html(page)).toHaveAttribute("data-palette", "nord");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  const gutter = await page.evaluate(
    () => document.documentElement.style.background,
  );
  expect(gutter).not.toBe("");

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
  expect(await firstFrame(page)).toEqual({
    readyState: "loading",
    theme: "dark",
    palette: "nord",
    background: gutter,
  });
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

  await page.keyboard.press("ArrowLeft");
  const last = paletteSection(page, "Dark").getByRole("radio").last();
  await expect(last).toHaveAttribute("aria-checked", "true");
  await expect(last).toBeFocused();
});
