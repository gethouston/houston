import { expect, test } from "../support/fixtures";
import { pinTheme } from "./support";

for (const width of [1280, 1440, 1920]) {
  test(`card header stays on one row at ${width}px with and without chat`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const card = page
      .locator("[data-kanban-card]")
      .filter({ has: page.getByText("Plan a trip to Tokyo", { exact: true }) });
    await expect(card).toBeVisible();
    await pinTheme(page, "light");
    const heights: Record<string, number> = {};
    for (const state of ["wide", "chat"] as const) {
      if (state === "chat") await card.click();
      await page.mouse.move(0, 0);
      // Reduced motion leaves the panel's final width immediately available.
      await expect(async () => {
        const header = await card.evaluate((el) => {
          const row = el.firstElementChild;
          if (!(row instanceof HTMLElement))
            throw new Error("missing card header");
          const identity = row.firstElementChild;
          const actions = row.lastElementChild;
          const time = row.querySelector("time");
          if (
            !(identity instanceof HTMLElement) ||
            !(actions instanceof HTMLElement) ||
            !time
          )
            throw new Error("missing card identity or actions");
          const name = [...identity.children].find(
            (child) =>
              child.classList.contains("truncate") && child.tagName !== "TIME",
          );
          const bounds = row.getBoundingClientRect();
          const actionBounds = actions.getBoundingClientRect();
          const timeBounds = time.getBoundingClientRect();
          return {
            height: bounds.height,
            timeRight: timeBounds.right,
            actionsLeft: actionBounds.left,
            actionsRight: actionBounds.right,
            rowRight: bounds.right,
            nameVisible:
              name instanceof HTMLElement &&
              getComputedStyle(name).display !== "none",
            truncated: time.scrollWidth > time.clientWidth,
          };
        });
        expect(header.height).toBe(24);
        expect(header.timeRight).toBeLessThanOrEqual(header.actionsLeft);
        expect(header.actionsRight).toBeLessThanOrEqual(header.rowRight);
        if (header.nameVisible) expect(header.truncated).toBe(false);
      }).toPass();
      heights[state] = await card.evaluate(
        (el) => el.getBoundingClientRect().height,
      );
      await testInfo.attach(`board-${state}-${width}`, {
        body: await page.screenshot({ animations: "disabled", fullPage: true }),
        contentType: "image/png",
      });
    }
    await testInfo.attach(`card-heights-${width}`, {
      body: JSON.stringify(heights),
      contentType: "application/json",
    });
  });
}
