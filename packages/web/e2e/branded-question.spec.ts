import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * A BRANDED question step (HOU-885): the model confirms app actions through the
 * ONE asking system — a regular `ask_user` question — and when the question
 * concerns an integration it carries a `toolkit` slug. The app resolves that
 * slug to the app's identity and BRANDS the shared `ChatInteractionCard`: the
 * modal's title becomes the app's logo + NAME (like the connect card), and the
 * question text moves into the body above the answer rows. There is no separate
 * approval card — options come FIRST, the free-text row sits below, and
 * answering resumes the turn exactly like any question.
 *
 * These drive the fake host's `/__test__/chat-interaction` control with a
 * `question` step carrying `toolkit`, mirroring the question specs in
 * interaction.spec.ts. The toolkit catalog (armed via `/__test__/capabilities`)
 * seeds gmail with an inline data-URI PNG, so the header can render the app's
 * real logo — never a broken image.
 */

/** Kick off a fresh mission whose next turn ends on the armed interaction. */
async function startMission(page: Page, text: string) {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();
  const composer = page.getByPlaceholder("What should the agent work on?");
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

/** A Gmail-branded confirmation question with two options. Its question text
 *  carries NO "Gmail" substring, so the header's app NAME is distinct from it. */
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

/** The interaction card container (the shared InteractionModal surface). */
function questionCard(page: Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "Should I send the draft to John?" });
}

/**
 * (1) The branded card wears the app's identity: the header shows the app NAME
 * (its own node, distinct from the question text), the question text renders in
 * the body, and the answer OPTIONS come FIRST with the free-text row below them —
 * the founder's fixed order (buttons first, typing below).
 */
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

  // Header identity line: the app NAME, its own node above the question body.
  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();

  // Both options render as single-select rows, and the free-text escape row
  // (options present -> the escape placeholder) sits alongside them.
  await expect(card.getByRole("radio")).toHaveCount(2);
  const freeText = card.getByPlaceholder("Type another option...");
  await expect(freeText).toBeVisible();

  // Order is FIXED: the first option row sits ABOVE the free-text row.
  const firstOption = card.getByRole("radio").first();
  const optionBox = await firstOption.boundingBox();
  const fieldBox = await freeText.boundingBox();
  expect(optionBox).not.toBeNull();
  expect(fieldBox).not.toBeNull();
  expect((optionBox?.y ?? 0) < (fieldBox?.y ?? 0)).toBe(true);
});

/**
 * The header resolves the app's REAL brand logo once the toolkits catalog
 * settles (integrations armed): the fake host seeds gmail with an inline
 * data-URI PNG, mirroring production's Composio `meta.logo`.
 */
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

/**
 * Without an integrations catalog the header still brands the question with the
 * app's prettified NAME — never a broken image, never the raw slug.
 */
test("brands with the prettified name and no logo when the catalog is absent", async ({
  page,
}) => {
  await armInteraction(page, [gmailQuestionStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });
  const card = questionCard(page);
  // The prettified slug label, not the raw "gmail".
  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();
  await expect(card.getByText("gmail", { exact: true })).toHaveCount(0);
  // No logo image resolved (catalog miss), so the header carries no <img>.
  await expect(card.getByRole("img", { name: "Gmail" })).toHaveCount(0);
});

/**
 * (2) Answering the branded question resumes the turn exactly like any question:
 * clicking an option completes the lone-step sequence, composes ONE visible user
 * message carrying the answer, the card retires, and the composer returns.
 */
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

  // Exactly ONE visible user message, carrying the answer.
  const composed = page.locator(".is-user").filter({ hasText: "Send it" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Should I send the draft to John?");

  // The answering turn starts, so the card retires (its option rows are gone —
  // the question TEXT legitimately lives on in the composed transcript message)
  // and the composer returns.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio")).toHaveCount(0);
});

/**
 * A question with NO `toolkit` is unbranded: the question text stays in the
 * TITLE (no app lockup), proving the branding is gated on the toolkit slug.
 */
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
  // No app-identity logo joins the header for a plain question.
  await expect(card.getByRole("img")).toHaveCount(0);
  await expect(card.getByRole("radio")).toHaveCount(2);
});
