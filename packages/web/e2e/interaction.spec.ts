import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Element 4: the pending-interaction hand-off. When a turn ends on an
 * `ask_user` / `request_connection`, its `done` frame carries a
 * `PendingInteraction`; the SDK settles the board to `needs_you` and the app
 * REPLACES the composer with the interaction card (`composerOverride`). These
 * specs arm the fake host's `/__test__/chat-interaction` control so the next
 * scripted turn ends on an interaction, then drive the whole seam end-to-end:
 * card replaces composer -> user answers -> normal composer returns.
 *
 * `ask_user` batches up to three questions into ONE call. The card stacks them
 * vertically, renders each question's options as single-select rows, and keeps
 * a free-text input ALWAYS visible at the bottom.
 */

/**
 * A batched (three-question) interaction: the card stacks the questions with
 * their option rows and an always-visible free-text field, the user answers two
 * by option and adds free text, and Send composes them into ONE user message.
 */
test("batches three questions in one card and composes a single reply", async ({
  page,
  request,
}) => {
  // Arm the NEXT turn to end asking three questions (mixed with/without options).
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        kind: "question",
        questions: [
          {
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            id: "q2",
            question: "Anything special I should know about the trip?",
          },
          {
            id: "q3",
            question: "Morning or evening flight?",
            options: [
              { id: "morning", label: "Morning flight" },
              { id: "evening", label: "Evening flight" },
            ],
          },
        ],
      },
    },
  });

  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill("plan my trip");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  // The card has taken over the composer slot. All three questions stack
  // vertically at once (not one-per-turn).
  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();

  // Two questions offer single-select option rows (the third is free-text only).
  await expect(page.getByRole("radiogroup")).toHaveCount(2);
  await expect(page.getByRole("radio")).toHaveCount(4);

  // The free-text field is ALWAYS visible (no toggle), and the normal follow-up
  // composer is gone.
  const freeText = page.getByPlaceholder("Type your answer...");
  await expect(freeText).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Answer two questions by option; clicking does NOT send (more than one
  // question), it selects.
  await page.getByRole("radio", { name: "Paris" }).click();
  await page.getByRole("radio", { name: "Morning flight" }).click();
  await expect(page.getByRole("radio", { name: "Paris" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Still on the card — nothing sent yet.
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Add free text and Send.
  await freeText.fill("Window seat please");
  await page.getByRole("button", { name: "Send" }).click();

  // ONE composed user message carries both option answers and the free text.
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "Window seat please" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Paris");
  await expect(composed).toContainText("Morning flight");

  // The answering turn starts, so the card retires and the composer returns.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radiogroup")).toHaveCount(0);
});

/**
 * The single-question fast path: one question with options and an empty input.
 * Clicking an option sends immediately (no separate Send press), the composed
 * reply is one user message, and the follow-up composer returns.
 */
test("single question with options sends on option click (fast path)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        kind: "question",
        questions: [
          {
            id: "q1",
            question: "Do you want the morning or evening flight?",
            options: [
              { id: "morning", label: "Morning flight" },
              { id: "evening", label: "Evening flight" },
            ],
          },
        ],
      },
    },
  });

  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill("book my flight");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  // The question card owns the composer slot; its options are always-visible
  // rows and the normal follow-up composer is gone.
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  const morning = page.getByRole("radio", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Evening flight" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Clicking an option sends immediately as one composed user message...
  await morning.click();

  await expect(
    page.locator(".is-user").filter({ hasText: "Morning flight" }),
  ).toHaveCount(1);
  // ...the answering turn starts, so the card retires (its option rows are gone)
  // and the normal composer returns through the same reactivity.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio", { name: "Evening flight" })).toHaveCount(
    0,
  );
});

/**
 * A connect interaction: the card replaces the composer with the reason and the
 * rich integration connect card (the same `IntegrationConnectCard` the inline
 * `#houston_toolkit` link renders) for the toolkit the agent asked for.
 */
test("shows the connect card in the composer slot for a request_connection", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        kind: "connect",
        toolkit: "gmail",
        reason: "I need access to your Gmail to send the trip itinerary.",
      },
    },
  });

  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();
  await composer.fill("email me the itinerary");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  // The connect card owns the composer slot: the reason plus the rich
  // integration connect card (its Connect action is the distinctive proof the
  // IntegrationConnectCard rendered), with the normal composer gone.
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});
