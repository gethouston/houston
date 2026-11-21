import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { workspaceMenuTrigger } from "./support/workspace-menu";

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
  expect(darkFill).not.toBe(lightFill);

  const box = await button.boundingBox();
  const footerBox = await footer(page).boundingBox();
  const accountBox = await workspaceMenuTrigger(page).boundingBox();
  expect(box).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(accountBox).not.toBeNull();
  if (box && footerBox && accountBox) {
    expect(box.x - footerBox.x).toBe(8);
    expect(footerBox.x + footerBox.width - (box.x + box.width)).toBe(8);
    expect(box.y + box.height).toBeLessThanOrEqual(accountBox.y);
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
  await expect(retry).toHaveAccessibleDescription(/couldn't be installed/);
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
