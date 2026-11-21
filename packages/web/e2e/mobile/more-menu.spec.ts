import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import {
  moreMenu,
  moreRow,
  navItem,
  openMoreMenu,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

test("More opens the card and closes again without navigating", async ({
  page,
}) => {
  await page.goto("/");

  const menu = await openMoreMenu(page);
  await expect(
    menu.getByRole("button", { name: "Connect your apps" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(navItem(page, "agents")).toHaveAttribute("aria-current", "page");
});

test("the menu lists what this deployment offers, with the rail's anchors", async ({
  page,
}) => {
  await page.goto("/");
  const menu = await openMoreMenu(page);

  for (const label of ["Connect your apps", "Connect your AI"]) {
    await expect(
      menu.getByRole("button", { name: label, exact: true }),
      `"${label}" should be a row of the More menu's connect group`,
    ).toBeVisible();
  }

  await expect(menu.getByTestId("rail-admin")).toHaveCount(0);

  for (const anchor of [
    "nav-integrations",
    "nav-ai-hub",
    "nav-academy",
    "nav-settings",
  ]) {
    await expect(
      moreRow(page, anchor),
      `the menu should carry the "${anchor}" anchor`,
    ).toHaveCount(1);
  }
  await expect(
    menu.getByRole("button", { name: "Skills", exact: true }),
  ).toHaveCount(0);

  await expect(
    menu.getByRole("button", { name: "Report a problem" }),
  ).toHaveCount(0);
  await expect(menu.getByText("Help", { exact: true })).toHaveCount(0);
});

test("Admin appears in More only for an admitted caller", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await page.goto("/");
  const menu = await openMoreMenu(page);
  await expect(menu.getByTestId("rail-admin")).toHaveCount(1);
  await menu.getByTestId("rail-admin").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "admin");

  await screen(page).locator("[data-company-context-trigger]").tap();
  await expect(
    page.getByRole("dialog", { name: "Company context" }),
  ).toBeVisible();
});

test("the account's destinations follow the connect rows, in the rail's order", async ({
  page,
}) => {
  await page.goto("/");
  const menu = await openMoreMenu(page);
  const ys: number[] = [];
  for (const row of [
    moreRow(page, "nav-ai-hub"),
    menu.getByTestId("more-account"),
    moreRow(page, "nav-academy"),
    moreRow(page, "nav-settings"),
  ]) {
    const box = await row.boundingBox();
    if (!box) throw new Error("the card is not laid out");
    ys.push(box.y);
  }
  expect(ys).toEqual([...ys].sort((a, b) => a - b));

  await menu.getByTestId("more-account").tap();
  const account = menu.getByTestId("more-account-page");
  await expect(account).toBeVisible();
  const back = account.getByRole("button", {
    name: "Your account, back to More",
  });
  await expect(back).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(moreRow(page, "nav-settings")).toBeHidden();
  await expect(
    account.getByRole("button", { name: "About me", exact: true }),
  ).toBeVisible();
  await expect(account.getByRole("button", { name: "Sign out" })).toHaveCount(
    0,
  );

  await back.tap();
  await expect(moreRow(page, "nav-settings")).toBeVisible();
  await expect(menu.getByTestId("more-account")).toBeFocused();
  await menu.getByTestId("more-account").tap();

  await account.getByRole("button", { name: "About me", exact: true }).tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "about-me");
  await expect(
    screen(page).getByRole("heading", { name: "About me", level: 1 }),
  ).toBeVisible();
});

test("the Settings row opens the settings index", async ({ page }) => {
  await page.goto("/");
  await openMoreMenu(page);

  await moreRow(page, "nav-settings").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await expect(
    screen(page).getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(screen(page).getByText("General")).toBeVisible();
});

test("a connect row lands on its screen and closes the menu", async ({
  page,
}) => {
  await page.goto("/");
  await openMoreMenu(page);

  await moreRow(page, "nav-integrations").tap();
  await expect(moreMenu(page)).toBeHidden();
  await expect(screen(page)).toHaveAttribute(
    "data-screen",
    "integrations-home",
  );
  await expect(navItem(page, "more")).toHaveAttribute("aria-current", "page");
});

test("the workspace switcher heads the card and switches workspace from its menu", async ({
  page,
}) => {
  await page.goto("/");
  const menu = await openMoreMenu(page);
  const switcher = menu.getByTestId("more-workspace-switcher");
  await expect(switcher).toHaveAttribute("aria-haspopup", "menu");
  await expect(switcher).toBeVisible();
  const switcherBox = await switcher.boundingBox();
  const firstRow = await moreRow(page, "nav-integrations").boundingBox();
  if (!switcherBox || !firstRow) throw new Error("the card is not laid out");
  expect(switcherBox.y + switcherBox.height).toBeLessThanOrEqual(firstRow.y);

  await switcher.tap();
  await expect(
    page.getByRole("menuitemcheckbox", { checked: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("menuitem").last()).toHaveText(
    "Create workspace",
  );
});
