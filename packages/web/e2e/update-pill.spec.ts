import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The "Restart to update" pill: the one surface a mid-session update find
 * ends in. It sits on the window gutter, so it has to be the high-contrast
 * element there in BOTH themes: it wears the primary action fill, never the
 * gutter-coloured dialog surface that made it disappear in dark mode.
 *
 * Driven through the dev-only preview harness (`__HOUSTON_UPDATE_PREVIEW__`,
 * `app/src/components/shell/update-preview.ts`): the real updater only runs
 * in packaged builds, and the harness renders the same component with a
 * simulated status.
 */

const footer = (page: Page) => page.getByTestId("sidebar-footer");
const pill = (page: Page) => footer(page).getByTestId("update-pill");
const restartButton = (page: Page) =>
  pill(page).getByRole("button", { name: /Restart to update/ });

type PreviewScene = "pill" | "error";
type PreviewWindow = Window & {
  __HOUSTON_UPDATE_PREVIEW__?: (scene: PreviewScene | null) => void;
};

async function showScene(page: Page, scene: PreviewScene) {
  await page.evaluate((s: PreviewScene) => {
    (window as PreviewWindow).__HOUSTON_UPDATE_PREVIEW__?.(s);
  }, scene);
}

/** The `action` role's fill under the CURRENT theme, read off a throwaway
 *  `bg-action` probe so the spec pins the role, not a value that the token
 *  files own. */
async function actionFill(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-action";
    document.body.appendChild(probe);
    const fill = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return fill;
  });
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t: "light" | "dark") => {
    if (t === "dark")
      document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, theme);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-tour-target='sidebar']")).toBeVisible();
});

test("names the restart, the version it lands on, and wears the action fill in both themes", async ({
  page,
}) => {
  await showScene(page, "pill");
  const button = restartButton(page);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button).toContainText("v0.6.16");
  await expect(button).toHaveAccessibleDescription(
    /Version 0\.6\.16 is downloaded/,
  );

  await setTheme(page, "light");
  const lightFill = await actionFill(page);
  await expect(button).toHaveCSS("background-color", lightFill);
  await setTheme(page, "dark");
  const darkFill = await actionFill(page);
  await expect(button).toHaveCSS("background-color", darkFill);
  // The two themes flip the fill (dark ink on light, light ink on dark), so
  // the pill is never the gutter's own colour in either.
  expect(darkFill).not.toBe(lightFill);

  const box = await button.boundingBox();
  const footerBox = await footer(page).boundingBox();
  const academyBox = await footer(page)
    .getByRole("button", { name: "Academy", exact: true })
    .boundingBox();
  expect(box).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(academyBox).not.toBeNull();
  if (box && footerBox && academyBox) {
    expect(box.x - footerBox.x).toBe(8);
    expect(footerBox.x + footerBox.width - (box.x + box.width)).toBe(8);
    expect(box.y + box.height).toBeLessThanOrEqual(academyBox.y);
  }
});

test("a click restarts: the pill reads Restarting and stops taking clicks", async ({
  page,
}) => {
  await showScene(page, "pill");
  await restartButton(page).click();
  const restarting = pill(page).getByRole("button", { name: /Restarting/ });
  await expect(restarting).toBeVisible();
  await expect(restarting).toBeDisabled();
});

test("a failed install offers the retry with the failure as its description", async ({
  page,
}) => {
  await showScene(page, "error");
  const retry = pill(page).getByRole("button", {
    name: /Update failed\. Try again/,
  });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(retry).toHaveAccessibleDescription(
    /couldn't install the update/,
  );
});

test("the collapsed footer keeps an icon-only restart with its label and description", async ({
  page,
}) => {
  await showScene(page, "pill");
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  const button = restartButton(page);
  await expect(button).toBeVisible();
  await expect(button).toHaveText("");
  await expect(button).toHaveAccessibleDescription(
    /Version 0\.6\.16 is downloaded/,
  );
  await expect(button).toHaveCSS("background-color", await actionFill(page));
  await button.hover();
  await expect(
    page.getByRole("tooltip", { name: "Restart to update" }),
  ).toBeVisible();
  await button.click();
  await expect(
    pill(page).getByRole("button", { name: /Restarting/ }),
  ).toBeDisabled();
});
