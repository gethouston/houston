import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { completeSurvey, resetToFirstRun } from "../support/onboarding";

/**
 * First-run on a phone, end to end: the survey, then the game-style in-app
 * setup over the REAL phone shell. Below md the rail lives in a drawer and
 * composing is a pushed chat, so the sidebar-row steps ring the hamburger
 * first and then the row inside the open drawer, and the send step follows
 * the compose tap into the draft chat. Every advance is app state — the hub
 * opening, a provider confirmed, the roster growing, a mission row landing —
 * never a Next button. This is the tier-1 gate that keeps the phone from
 * dead-ending a new user in a mandatory setup they cannot finish.
 */

/** The narration card's one action. */
function centerCta(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title }).getByRole("button");
}

/** A drawer-row step on the phone: hamburger → the row inside the drawer. */
async function tapDrawerRow(page: Page, rowTitle: string, target: string) {
  await expect(
    page.getByRole("dialog", { name: "Open the menu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).tap();
  // The open Sheet is a modal, so Radix marks everything outside it
  // `aria-hidden` — the coach chip included — hence `includeHidden` for the
  // in-drawer beat (the a11y shape the in-dialog coaching has always had).
  await expect(
    page.getByRole("dialog", { name: rowTitle, includeHidden: true }),
  ).toBeVisible();
  await page.locator(`[data-tour-target='${target}']`).tap();
}

test("the guided setup completes on a phone: drawer rows, provider connect, first agent, first task", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);

  await expect(
    page.getByRole("heading", { name: "Welcome to Houston!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start setup" }).tap();
  await page.getByRole("button", { name: "Show me" }).tap();

  // AI Models is a drawer row on the phone.
  await tapDrawerRow(page, "Click AI Models", "nav-ai-hub");
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Pick the AI you already use." }),
  ).toBeVisible();

  // Connect on the real hub (the api-key path; the fake host accepts any key).
  const search = page.getByPlaceholder("Search AI models and providers");
  await search.tap();
  await search.fill("openrouter");
  await page.getByRole("button", { name: "Connect OpenRouter" }).tap();
  await page.getByPlaceholder("Paste your API key").fill("sk-or-e2e-phone");
  await page.getByRole("button", { name: "Connect", exact: true }).tap();
  await centerCta(page, "Your AI is connected!").tap();
  await centerCta(page, "Create your first agent").tap();

  // New agent is a drawer row too; the dialog coaching is unchanged.
  await tapDrawerRow(page, "Click New agent", "newAgent");
  // In-dialog coaching sits outside the modal (aria-hidden), as on desktop.
  await expect(page.getByText("Click Create new")).toBeVisible();
  await page.getByRole("button", { name: "Create new", exact: true }).tap();
  // The color palette wraps inside the phone dialog instead of running off
  // its right edge (ten swatches outgrow a phone-width card in one row).
  const naming = page.locator("[data-tutorial-target='createAgentNaming']");
  const frame = await naming.boundingBox();
  if (!frame) throw new Error("naming step did not lay out");
  for (const swatch of await naming.locator("button[type='button']").all()) {
    const box = await swatch.boundingBox();
    if (!box) throw new Error("swatch did not lay out");
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
  }
  await page
    .getByPlaceholder("e.g. Product manager, Sales, Jerry")
    .fill("Aurora");
  await page.getByRole("button", { name: "Create Agent" }).tap();
  await centerCta(page, "Agent created!").tap();
  await centerCta(page, "Give it work").tap();

  // New task is the phone board's own compose control; the tap pushes the
  // draft chat and the ring follows it there.
  await expect(
    page.getByRole("dialog", { name: "Click New task" }),
  ).toBeVisible();
  // Two anchors share the name on the phone board (the CSS-hidden desktop
  // button beside the phone's compose); the spotlight rings the visible one.
  await page
    .locator("[data-screen-active='true'] [data-tour-target='newMission']")
    .filter({ visible: true })
    .tap();
  await expect(
    page.getByRole("dialog", { name: "Tell it what you need." }),
  ).toBeVisible();
  const composer = page
    .getByTestId("mission-chat-screen")
    .getByPlaceholder("What should the agent work on?");
  await composer.fill("Say hello");
  await composer.press("Enter");

  // The finale, then the Academy reveal closes the run and lands there.
  await centerCta(page, "Task sent!").tap();
  await centerCta(page, "Chapter 1 complete!").tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
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
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
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

test("a reload mid-setup resumes the sequence, not the welcome beat", async ({
  page,
  request,
}) => {
  // Phones evict a background tab: leaving to fetch a sign-in code and
  // coming back reloads the app. The run must re-enter at the connect
  // sequence (its sidebar beat, which self-advances on the hub), never at
  // "Start setup" with the work so far forgotten.
  await resetToFirstRun(request);
  await page.goto("/");
  await completeSurvey(page);
  await page.getByRole("button", { name: "Start setup" }).tap();
  await page.getByRole("button", { name: "Show me" }).tap();
  await tapDrawerRow(page, "Click AI Models", "nav-ai-hub");
  await expect(
    page.getByRole("dialog", { name: "Pick the AI you already use." }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("dialog", { name: "Open the menu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome to Houston!" }),
  ).toHaveCount(0);
  await tapDrawerRow(page, "Click AI Models", "nav-ai-hub");
  await expect(
    page.getByRole("dialog", { name: "Pick the AI you already use." }),
  ).toBeVisible();

  // The connect itself still lands, and the run carries on from there.
  const search = page.getByPlaceholder("Search AI models and providers");
  await search.tap();
  await search.fill("openrouter");
  await page.getByRole("button", { name: "Connect OpenRouter" }).tap();
  await page.getByPlaceholder("Paste your API key").fill("sk-or-e2e-resume");
  await page.getByRole("button", { name: "Connect", exact: true }).tap();
  await expect(
    page.getByRole("dialog", { name: "Your AI is connected!" }),
  ).toBeVisible();
});
