import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Element 4 (v3): the pending-interaction hand-off, now a STEPPER. When a turn
 * ends on an `ask_user` / `request_connection`, its `done` frame carries a
 * `PendingInteraction { steps }`; the SDK settles the board to `needs_you` and
 * the app REPLACES the composer with ONE `ChatInteractionCard` that walks the
 * user through the steps ONE AT A TIME with a "N of X" progress indicator. These
 * specs arm the fake host's `/__test__/chat-interaction` control with the new
 * `{ steps }` shape, then drive the whole seam: card replaces composer -> user
 * answers each step -> normal composer returns.
 *
 * A turn's steps are the question steps (from one ask_user call, 1 to 3) FOLLOWED
 * BY at most one signin step (the user must sign in to Houston first) FOLLOWED BY
 * the connect steps (one per request_connection). Question answers compose one
 * user message on completion; a signin/connect-only sequence keeps the hidden
 * auto-continue. Real Google SSO cannot run in the harness, so the signin specs
 * assert the card RENDERS (button + reason + progress), not the landing.
 */

/** Kick off a fresh mission whose next turn ends on the armed interaction. */
async function startMission(
  page: import("@playwright/test").Page,
  text: string,
) {
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

/**
 * The three-question stepper: only ONE step shows at a time with a "N of 3"
 * progress. Answer step 1 by option, step 2 by free text, step 3 by option; the
 * completion composes ONE user message carrying all three answers, and the
 * normal follow-up composer returns.
 */
test("walks three questions one at a time and composes a single reply", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "q2",
            question: "Anything special I should know about the trip?",
          },
          {
            kind: "question",
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

  await startMission(page, "plan my trip");

  // Step 1 of 3 only: the first question, its options, the always-visible input.
  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 3")).toBeVisible();
  // The other questions are NOT on screen yet (one step at a time).
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByText("Morning or evening flight?")).toHaveCount(0);

  // Exactly this step's two options, plus the escape-hatch free-text field, and
  // the normal follow-up composer is gone.
  await expect(page.getByRole("radio")).toHaveCount(2);
  const freeText = page.getByPlaceholder("Type your answer...");
  await expect(freeText).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Answer step 1 by option -> advances to step 2 of 3 (a free-text-only
  // question). On a multi-step sequence the click advances, it does not send.
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible();
  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Answer step 2 by free text -> advances to step 3 of 3.
  await freeText.fill("Window seat please");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("3 of 3")).toBeVisible();

  // Answer the LAST step by option -> completes and sends ONE composed message.
  await page.getByRole("radio", { name: "Evening flight" }).click();

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "Window seat please" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Paris");
  await expect(composed).toContainText("Evening flight");

  // The answering turn starts, so the card retires and the composer returns.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 3")).toHaveCount(0);
});

/**
 * The back chevron: from step 2 it returns to the previous, already-answered step
 * with that answer pre-selected, and re-answering replaces it.
 */
test("back chevron returns to the previous answered step, pre-selected", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "q2",
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

  await startMission(page, "plan my trip");

  // Answer step 1 (Paris) and land on step 2.
  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();

  // Back -> step 1 again, with Paris pre-selected (the committed answer).
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Which city are you flying to?")).toBeVisible();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Paris" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Re-answer with the other option -> replaces the answer and advances again.
  await page.getByRole("radio", { name: "Tokyo" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();

  // Finish; the composed message carries the REPLACED answer (Tokyo, not Paris).
  await page.getByRole("radio", { name: "Evening flight" }).click();
  const composed = page.locator(".is-user").filter({ hasText: "Tokyo" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Evening flight");
  await expect(composed).not.toContainText("Paris");
});

/**
 * The single-question fast path: one question with options and no progress
 * chrome (total is 1). Clicking an option completes immediately — click = answer
 * = send — and the follow-up composer returns.
 */
test("single question with options sends on option click (fast path)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
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

  await startMission(page, "book my flight");

  // The lone question owns the composer slot; a single step shows NO progress
  // indicator and NO back chevron (the one-tap feel is preserved).
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  const morning = page.getByRole("radio", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // Clicking an option completes immediately as one composed user message...
  await morning.click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Morning flight" }),
  ).toHaveCount(1);
  // ...the answering turn starts, so the card retires and the composer returns.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio", { name: "Evening flight" })).toHaveCount(
    0,
  );
});

/**
 * A mixed sequence (question THEN connect): answering the question advances the
 * SAME card to the connect step as the final step, with "2 of 2" progress and
 * the rich integration connect card. (The connect can't complete real OAuth in
 * the harness, so this asserts the render, not the landing.)
 */
test("advances from a question to a connect step in one sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Who should I send the itinerary to?",
          },
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  // Step 1 of 2: the question, free-text only (no options), no connect card yet.
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);

  // Answer the question -> advance to the connect step (2 of 2). The reason and
  // the rich IntegrationConnectCard (its Connect action is the proof it rendered)
  // now own the card; the question text is gone.
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // The composer is still replaced: the sequence isn't complete until connect.
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});

/**
 * A three-step sequence (question THEN signin THEN connect): answering the
 * question advances the SAME card to the signin step (2 of 3), which renders the
 * reason, the "Sign in to Houston" card, and a Sign in button. Real Google SSO
 * can't run in the harness, so this asserts the signin step RENDERS in the middle
 * of the sequence, not that it lands — the connect step (3 of 3) stays queued
 * behind it and the composer stays replaced.
 */
test("advances from a question to a signin step in a three-step sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Who should I send the itinerary to?",
          },
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston so I can send email on your behalf.",
          },
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  // Step 1 of 3: the question, free-text only. No signin/connect surface yet.
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);

  // Answer the question -> advance to the SIGNIN step (2 of 3). Its reason, the
  // "Sign in to Houston" card and the Sign in button now own the card; the
  // question text is gone and the connect step (3 of 3) is still queued behind it.
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // The connect step hasn't been reached, and the composer is still replaced.
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});

/**
 * A signin-only sequence (a tool 409'd with the user signed out, no questions and
 * no connections): the card shows the reason plus the "Sign in to Houston" card
 * and a Sign in button as the ONLY step, with no progress chrome. SSO can't run
 * in the harness, so this asserts the lone signin card renders.
 */
test("shows a lone signin step for a signin-only sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston to use your connected apps.",
          },
        ],
      },
    },
  });

  await startMission(page, "check my email");

  // The signin card owns the composer slot: the reason plus the Sign in button,
  // a single step (no progress chrome), composer gone.
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});

/**
 * A connect-only sequence (single request_connection, no questions): the card
 * shows the reason plus the rich integration connect card as the ONLY step, with
 * no progress chrome, unchanged from before the stepper.
 */
test("shows a lone connect step for a connect-only sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  // The connect card owns the composer slot: the reason plus the rich
  // integration connect card, a single step (no progress), composer gone.
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});
