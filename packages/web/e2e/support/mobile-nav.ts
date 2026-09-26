import { expect, type Locator, type Page } from "@playwright/test";
import { screen } from "./team-nav";

/**
 * Driving the PHONE shell (<768px): the floating nav bar, its More menu, and
 * the AI Employees list.
 *
 * There is no top bar and no drawer. Everything a phone user reaches is one of
 * three things — the AI Employees tree, the More menu's long tail, or the
 * compose button — so these helpers name exactly those, and every lookup goes
 * by test id or tour anchor rather than by chrome that moved.
 *
 * English is forced by the boot seed, so the labels below are stable.
 */

/**
 * How a spec presses a control.
 *
 * The `mobile` project has touch and taps like a phone; the `visual` project is
 * a DESKTOP context sized to a phone, where `tap()` throws ("hasTouch" is off).
 * One knob rather than two copies of every helper.
 */
export type PressMode = "tap" | "click";

export async function press(
  locator: Locator,
  mode: PressMode = "tap",
): Promise<void> {
  if (mode === "tap") await locator.tap();
  else await locator.click();
}

/**
 * The phone's boot landing, painted: the Agents home with its first row on the
 * glass. The rows wait on the one-sweep conversations query, which on a cold
 * dev server sits behind the first transform of the whole app chunk; on a CI
 * runner sharing two workers that has outlasted the default expect window
 * (the failure screenshot showed the row painted, just late). The BOOT anchor
 * alone gets the longer wait; everything after it keeps the default.
 */
export async function awaitAgentsHome(page: Page): Promise<Locator> {
  const row = page.getByTestId("agents-home-row").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

/** The two items of the pill. "More" is a MENU, not a destination. */
export type MobileTab = "agents" | "more";

/** The floating pill + its compose button. CSS-hidden at md+, gone under a
 *  pushed chat. */
export function navBar(page: Page): Locator {
  return page.getByTestId("mobile-nav-bar");
}

/**
 * One item of the pill, by its `data-tab` rather than its accessible name: the
 * open More menu is a Radix dialog, which marks everything outside it
 * `aria-hidden`, so a role lookup stops finding the bar exactly when a spec
 * wants to assert what it looks like behind the menu.
 */
export function navItem(page: Page, tab: MobileTab): Locator {
  return navBar(page).locator(`[data-tab='${tab}']`);
}

/** The round compose button beside the pill — a new task scoped to where the
 *  user is standing. */
export function newTaskButton(page: Page): Locator {
  return navBar(page).getByRole("button", { name: "New task" });
}

/** The floating card More raises. */
export function moreMenu(page: Page): Locator {
  return page.getByTestId("mobile-more-menu");
}

/** One destination inside the open menu, by the RAIL's own tour anchor — the
 *  same vocabulary on both breakpoints. */
export function moreRow(page: Page, anchor: string): Locator {
  return moreMenu(page).locator(`[data-tour-target='${anchor}']`);
}

/** Raise the More menu and wait for it. */
export async function openMoreMenu(
  page: Page,
  mode: PressMode = "tap",
): Promise<Locator> {
  await press(navItem(page, "more"), mode);
  const menu = moreMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

/** One section of an employee: its task list, or a tab of its own screen. */
export type PhoneTeamSection = "mission-control" | "routines" | "files";

/**
 * Open the first employee on one section, the way a phone user does: drill
 * into the employee from the AI Employees list, which IS its Tasks, then pick
 * Routines or Files from that task list's ⋯ menu.
 */
export async function openPhoneTeamSection(
  page: Page,
  section: PhoneTeamSection,
  mode: PressMode = "tap",
): Promise<void> {
  await press(navItem(page, "agents"), mode);
  await press(await awaitAgentsHome(page), mode);
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  if (section === "mission-control") return;
  await press(page.getByTestId("agent-missions-menu"), mode);
  await press(
    page
      .getByTestId("agent-missions-menu-section")
      .and(page.locator(`[data-section='${section}']`)),
    mode,
  );
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
}
