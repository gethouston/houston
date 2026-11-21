import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import {
  FOLLOW_UP_PLACEHOLDER,
  NEW_TASK_PLACEHOLDER,
} from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";

async function startMission(page: Page, text: string) {
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
}

async function armInteraction(page: Page, steps: unknown[]) {
  await page.request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps } },
  });
}

async function armIntegrations(page: Page) {
  await page.request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
}

const gmailQuestionStep = {
  kind: "question",
  id: "q1",
  question: "Should I send the draft to John?",
  toolkit: "gmail",
  options: [
    { id: "send", label: "Send it" },
    { id: "hold", label: "Hold off" },
  ],
} as const;

function questionCard(page: Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "Should I send the draft to John?" });
}

test("renders the app-branded header with options first and free-text below", async ({
  page,
}) => {
  await armIntegrations(page);
  await armInteraction(page, [gmailQuestionStep]);
  await startMission(page, "send the draft");

  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });
  const card = questionCard(page);

  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();

  await expect(card.getByRole("radio")).toHaveCount(2);
  const freeText = card.getByPlaceholder("Type another option...");
  await expect(freeText).toBeVisible();

  const firstOption = card.getByRole("radio").first();
  const optionBox = await firstOption.boundingBox();
  const fieldBox = await freeText.boundingBox();
  expect(optionBox).not.toBeNull();
  expect(fieldBox).not.toBeNull();
  expect((optionBox?.y ?? 0) < (fieldBox?.y ?? 0)).toBe(true);
});

test("renders the app's real logo in the header once the catalog resolves", async ({
  page,
}) => {
  await armIntegrations(page);
  await armInteraction(page, [gmailQuestionStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });
  const card = questionCard(page);
  const logo = card.getByRole("img", { name: "Gmail" });
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/png/);
});

test("brands with the prettified name and no logo when the catalog is absent", async ({
  page,
}) => {
  await armInteraction(page, [gmailQuestionStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });
  const card = questionCard(page);
  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();
  await expect(card.getByText("gmail", { exact: true })).toHaveCount(0);
  await expect(card.getByRole("img", { name: "Gmail" })).toHaveCount(0);
});

test("answering by option resumes the turn and retires the card", async ({
  page,
}) => {
  await armIntegrations(page);
  await armInteraction(page, [gmailQuestionStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("radio", { name: "Send it" }).click();

  const composed = page.locator(".is-user").filter({ hasText: "Send it" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Should I send the draft to John?");

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("a question with no toolkit renders plain, unbranded", async ({
  page,
}) => {
  await armIntegrations(page);
  await armInteraction(page, [
    {
      kind: "question",
      id: "q1",
      question: "Which city are you flying to?",
      options: [
        { id: "paris", label: "Paris" },
        { id: "tokyo", label: "Tokyo" },
      ],
    },
  ]);
  await startMission(page, "plan the offsite");

  const card = page
    .locator("div.overflow-clip")
    .filter({ hasText: "Which city are you flying to?" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByRole("img")).toHaveCount(0);
  await expect(card.getByRole("radio")).toHaveCount(2);
});
