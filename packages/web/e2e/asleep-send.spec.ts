import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Locator, Page } from "@playwright/test";
import {
  FOLLOW_UP_PLACEHOLDER,
  NEW_TASK_PLACEHOLDER,
} from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";
import { missionCard } from "./support/team-nav";

const HOLD_MS = 8_000;
const BUBBLE_GRACE_MS = 3_000;

const userRow = (page: Page, text: string): Locator =>
  page
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: text });

async function holdAgentReads(
  request: Parameters<Parameters<typeof test>[2]>[0]["request"],
  ms: number,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms },
  });
}

test("a follow-up sent to an asleep pod shows the message instantly", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await holdAgentReads(request, HOLD_MS);

  await composer.fill("also book the hotel");
  await composer.press("Enter");

  await expect(userRow(page, "also book the hotel")).toBeVisible({
    timeout: BUBBLE_GRACE_MS,
  });
  await expect(composer).toHaveValue("");

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: HOLD_MS + 15_000,
  });
});

test("a new mission sent to an asleep pod shows the message instantly", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();

  await holdAgentReads(request, HOLD_MS);

  await composer.fill("plan the offsite");
  await composer.press("Enter");

  await expect(userRow(page, "plan the offsite")).toBeVisible({
    timeout: BUBBLE_GRACE_MS,
  });

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: HOLD_MS + 15_000,
  });
});
