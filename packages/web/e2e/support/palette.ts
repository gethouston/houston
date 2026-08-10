import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Open the ⌘K command palette and hand back its search input.
 *
 * The shortcut is a window keydown listener the shell attaches in an effect,
 * and effects run AFTER the paint that puts the rail's ready-marker on screen —
 * so a spec that presses the instant that marker shows can land its one
 * keystroke before the listener exists, and a keypress, unlike a locator
 * action, has no auto-retry. On a busy CI runner that race is real: the press
 * is dropped, the palette never opens, and the spec hangs to its timeout.
 *
 * So the press itself retries: press, give the dialog a beat to answer, press
 * again only while it stays shut. The guard on a visible input keeps the
 * shortcut's toggle from closing a palette that did open.
 */
export async function openPalette(page: Page): Promise<Locator> {
  const search = page.getByPlaceholder("Search agents, tasks, actions...");
  await expect(async () => {
    if (!(await search.isVisible())) {
      await page.keyboard.press("ControlOrMeta+KeyK");
    }
    await expect(search).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return search;
}
