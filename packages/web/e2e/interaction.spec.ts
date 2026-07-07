import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Element 4: the pending-interaction hand-off. When a turn ends on an
 * `ask_user` / `request_connection`, its `done` frame carries a
 * `PendingInteraction`; the SDK settles the board to `needs_you` and the app
 * REPLACES the composer with the interaction card (`composerOverride`). These
 * specs arm the fake host's `/__test__/chat-interaction` control so the next
 * scripted turn ends on an interaction, then drive the whole seam end-to-end:
 * card replaces composer → user answers → normal composer returns.
 */

/**
 * A question interaction: the card replaces the composer with the prompt and
 * its option buttons, clicking an option sends its label as a new user message,
 * and the follow-up composer returns once the answering turn starts.
 */
test("shows the question card in place of the composer and answers via an option", async ({
  page,
  request,
}) => {
  // Arm the NEXT turn to end asking the user to pick a flight time.
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        kind: "question",
        question: "Do you want the morning or evening flight?",
        options: [
          { id: "morning", label: "Morning flight" },
          { id: "evening", label: "Evening flight" },
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

  // The turn streams its canned reply and settles on the interaction.
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  // The question card has taken over the composer slot: the prompt reads as
  // the one thing to do, its options are always-visible buttons, and the
  // normal follow-up composer is gone.
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  const morning = page.getByRole("button", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Evening flight" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Clicking an option sends its label as a normal user message...
  await morning.click();

  await expect(page.getByText("Morning flight").first()).toBeVisible();
  // ...the answering turn starts, so the card retires and the normal composer
  // returns through the same reactivity.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toHaveCount(0);
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
