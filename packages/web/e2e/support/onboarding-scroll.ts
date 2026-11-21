import { expect, type Locator, type Page } from "@playwright/test";
import { managerOnboarding, onboardingPrompt } from "./manager-onboarding";

interface Clearance {
  inView: boolean;
  aboveStep: boolean;
}

async function clearance(
  line: Locator,
  pane: Locator,
  step: Locator,
): Promise<Clearance | null> {
  const [lineBox, paneBox, stepBox] = await Promise.all([
    line.boundingBox(),
    pane.boundingBox(),
    step.boundingBox(),
  ]);
  if (!lineBox || !paneBox || !stepBox) return null;
  return {
    inView: lineBox.y >= paneBox.y,
    aboveStep: lineBox.y + lineBox.height <= stepBox.y,
  };
}

export async function scrollLogToStart(page: Page): Promise<void> {
  const pane = managerOnboarding(page).locator(".conversation-scroll-pane");
  await expect
    .poll(() => pane.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  await pane.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect.poll(() => pane.evaluate((el) => el.scrollTop)).toBe(0);
}

export async function expectLatestLinesClearOfStep(page: Page): Promise<void> {
  const log = managerOnboarding(page);
  const step = onboardingPrompt(page);
  await expect(step).toBeVisible();
  const pane = log.locator(".conversation-scroll-pane");
  const newest = log.locator("[data-conversation-message-key]").last();
  await expect
    .poll(() => clearance(newest, pane, step))
    .toEqual({ inView: true, aboveStep: true });
  for (const line of [
    log.locator('[data-conversation-message-key^="assistant-"]').last(),
    log.locator('[data-conversation-message-key^="user-"]').last(),
  ]) {
    if ((await line.count()) === 0) continue;
    await expect
      .poll(async () => (await clearance(line, pane, step))?.aboveStep)
      .toBe(true);
  }
}
