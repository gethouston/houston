import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { awaitAgentsHome, navBar } from "../support/mobile-nav";
import {
  buildTeamHeading,
  completeSurvey,
  connectAiHeading,
  connectAiOnCard,
  resetToFirstRun,
} from "../support/onboarding";
import { hireOnTeamCard, hireYourTeamOption } from "../support/team-card";

/**
 * First-run on a phone, end to end: the survey, "Connect your AI", then
 * "Build your team", all full-screen cards outside the phone shell, and then
 * the shell itself. This is the tier-1 gate that keeps the phone from
 * dead-ending a new user in a mandatory onboarding they cannot finish.
 */

/** Zero horizontal overflow: the phone layout's standing rule. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("first run completes on a phone: survey, provider connect, first hire, the app", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);

  // Connect on the card (the api-key path; the fake host accepts any key).
  await expect(connectAiHeading(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await connectAiOnCard(page);
  await expectNoHorizontalOverflow(page);

  // Hire one AI Employee through the card's walk: the survey's industry is
  // already answered, then a job, then the name screen.
  await hireYourTeamOption(page).tap();
  await expect(
    page.getByRole("heading", {
      name: "What industry does this AI Employee work in?",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).tap();
  await page.getByRole("radio", { name: "Production planner" }).tap();

  // The photo corner opens the color sheet with two rows of five.
  await page.getByRole("button", { name: "Change color" }).tap();
  await expect(
    page.getByRole("dialog", { name: "Color", exact: true }),
  ).toBeVisible();
  const frame = await page.locator(".setup-step-in").boundingBox();
  if (!frame) throw new Error("team card did not lay out");
  const swatches = page
    .getByRole("radiogroup", { name: "Color" })
    .getByRole("radio");
  await expect(swatches.first()).toBeVisible();
  for (const swatch of await swatches.all()) {
    const box = await swatch.boundingBox();
    if (!box) throw new Error("swatch did not lay out");
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Change color" }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "Name (Production planner)" })
    .fill("Aurora");
  await page.getByRole("button", { name: "Hire", exact: true }).tap();
  await expect(
    page.getByRole("heading", { name: "You hired your first AI Employee" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).tap();

  // The phone shell takes over, landing on the Agents home with the hire.
  await expect(navBar(page)).toBeVisible();
  const row = await awaitAgentsHome(page);
  await expect(row).toContainText("Aurora");
  await expectNoHorizontalOverflow(page);
});

test("the disclaimer's accept button fits inside the phone card", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("houston.pref.legal_acceptance");
  });
  await page.goto("/");

  const accept = page.getByRole("button", {
    name: "I understand and want to continue",
  });
  await expect(accept).toBeVisible();
  const card = page.locator(".setup-step-in");
  const [button, frame] = await Promise.all([
    accept.boundingBox(),
    card.boundingBox(),
  ]);
  if (!button || !frame) throw new Error("disclaimer card did not lay out");
  expect(button.x + button.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(button.x).toBeGreaterThanOrEqual(frame.x);

  await accept.tap();
  await expect(navBar(page)).toBeVisible();
});

test.describe("short phone viewport", () => {
  // A small phone under Safari's chrome: the card's 88dvh frame is shorter
  // than the survey column, which then has to scroll rather than overflow
  // the frame at both ends (the logo above the card, Continue below it).
  test.use({ viewport: { width: 375, height: 600 } });

  test("the survey scrolls inside its card instead of overflowing it", async ({
    page,
    request,
  }) => {
    await resetToFirstRun(request);
    await page.goto("/");
    const heading = page.getByRole("heading", {
      name: "What best describes your work?",
    });
    await expect(heading).toBeVisible();

    // The card IS the screen on the phone: full width, no floating frame.
    const card = await page.locator(".setup-step-in").boundingBox();
    if (!card) throw new Error("survey card did not lay out");
    expect(card.x).toBe(0);
    expect(card.width).toBe(375);

    const scroll = page.getByTestId("survey-scroll");
    const [frame, top] = await Promise.all([
      scroll.boundingBox(),
      heading.boundingBox(),
    ]);
    if (!frame || !top) throw new Error("survey card did not lay out");
    expect(top.y).toBeGreaterThanOrEqual(frame.y);
    expect(
      await scroll.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);

    // Continue is reachable by scrolling, and advances — and the next
    // question opens at ITS top, not at the scroll position Continue left.
    await page.getByRole("button", { name: "Operations" }).tap();
    const next = page.getByRole("button", { name: "Continue" });
    await next.scrollIntoViewIfNeeded();
    await next.tap();
    const industry = page.getByRole("heading", {
      name: "What industry do you work in?",
    });
    await expect(industry).toBeVisible();
    const [frame2, top2] = await Promise.all([
      scroll.boundingBox(),
      industry.boundingBox(),
    ]);
    if (!frame2 || !top2) throw new Error("industry step did not lay out");
    expect(top2.y).toBeGreaterThanOrEqual(frame2.y);
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test("a reload mid-onboarding resumes on the card the user left", async ({
  page,
  request,
}) => {
  // Phones evict a background tab: leaving to fetch a sign-in code and coming
  // back reloads the app. The run must re-enter on the card it stood on, never
  // on the survey with the work so far forgotten, and never in the app early.
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);
  await expect(connectAiHeading(page)).toBeVisible();

  await page.reload();
  await expect(connectAiHeading(page)).toBeVisible();

  // The first hire flips the zero-agent first-run signal; the pending flag
  // still holds the user on the team card across a reload.
  await connectAiOnCard(page);
  await hireYourTeamOption(page).tap();
  await hireOnTeamCard(page, "Aurora", "tap");
  await page.reload();
  await expect(buildTeamHeading(page)).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);
});
