import { expect, type Locator, type Page } from "@playwright/test";

export async function openPalette(page: Page): Promise<Locator> {
  const search = page.getByPlaceholder(
    "Search AI Employees, tasks, actions...",
  );
  await expect(async () => {
    if (!(await search.isVisible())) {
      await page.keyboard.press("ControlOrMeta+KeyK");
    }
    await expect(search).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return search;
}
