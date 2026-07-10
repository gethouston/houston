import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Element 4 (v3): the pending-interaction hand-off, a STEPPER. When a turn
 * ends on an `ask_user` / `request_connection`, its `done` frame carries a
 * `PendingInteraction { steps }`; the SDK settles the board to `needs_you` and
 * the app shows ONE `ChatInteractionCard` ABOVE the composer (which stays
 * mounted and usable throughout) that walks the user through the steps ONE AT
 * A TIME with a quiet "Step N of M" progress label. Typing a fresh message directly into the
 * composer while the card shows abandons the whole sequence and sends the
 * typed text as a normal message instead of an answer. These specs arm the
 * fake host's `/__test__/chat-interaction` control with the `{ steps }`
 * shape, then drive the whole seam: card appears above the composer -> user
 * answers each step (or abandons) -> card retires, composer stands alone.
 *
 * A turn's steps are the question steps (from one ask_user call, 1 to 3) FOLLOWED
 * BY at most one signin step (the user must sign in to Houston first) FOLLOWED BY
 * the connect steps (one per request_connection). Question answers compose one
 * structured user message on completion (each question in muted text, its answer
 * in bold directly below); a signin/connect-only sequence keeps the hidden
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
 * The three-question stepper: only ONE step shows at a time with a
 * quiet "Step N of M" progress label. Answer step 1 by option, step 2 by free text, step 3
 * by option; the completion composes ONE structured user message carrying all
 * three answers, and the normal follow-up composer (which was visible the
 * whole time) is all that's left.
 */
test("walks three questions one at a time and composes a single structured reply", async ({
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
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  // The other questions are NOT on screen yet (one step at a time).
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByText("Morning or evening flight?")).toHaveCount(0);

  // Exactly this step's two options, plus the escape-hatch free-text field, and
  // the real composer stays visible and usable alongside the card.
  await expect(page.getByRole("radio")).toHaveCount(2);
  const freeText = page.getByPlaceholder("Type something else...");
  await expect(freeText).toBeVisible();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  await expect(composer).toBeEditable();

  // Answer step 1 by option -> advances to step 2 of 3 (a free-text-only
  // question). On a multi-step sequence the click advances, it does not send.
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(composer).toBeVisible();

  // Answer step 2 by free text -> advances to step 3 of 3. The footer's "Next"
  // button commits the draft (no per-field submit icon anymore).
  await freeText.fill("Window seat please");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();

  // Answer the LAST step by option -> completes and sends ONE composed message.
  await page.getByRole("radio", { name: "Evening flight" }).click();

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "Window seat please" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Paris");
  await expect(composed).toContainText("Evening flight");
  // Structured rendering, not a flat "question: answer" line: the question
  // text itself renders as its own muted-text element above the bold answer.
  await expect(
    composed
      .locator("span")
      .filter({ hasText: "Which city are you flying to?" }),
  ).toBeVisible();

  // The answering turn starts, so the card retires and the composer remains.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Step 1 of 3")).toHaveCount(0);
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
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();

  // Back -> step 1 again, with Paris pre-selected (the committed answer).
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Which city are you flying to?")).toBeVisible();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Paris" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Re-answer with the other option -> replaces the answer and advances again.
  // (Clicking an option advances directly; no ambiguity with the header's
  // forward chevron, which also carries the "Next" accessible name here since
  // this step was already reached.)
  await page.getByRole("radio", { name: "Tokyo" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();

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
 * = send — and the composer (already visible throughout) is all that's left.
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

  // The lone question shows above the composer; a single step shows NO
  // progress chrome and NO back chevron (the one-tap feel is preserved).
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  const morning = page.getByRole("radio", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();

  // Clicking an option completes immediately as one composed user message...
  await morning.click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Morning flight" }),
  ).toHaveCount(1);
  // ...the answering turn starts, so the card retires and the composer remains.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio", { name: "Evening flight" })).toHaveCount(
    0,
  );
});

/**
 * Number-key shortcuts: pressing "2" selects the second option row, mirroring
 * its visible position number, without needing to click.
 */
test("pressing a number key selects the matching option", async ({
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
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  const question = page.getByText("Which city are you flying to?");
  await expect(question).toBeVisible({ timeout: 15_000 });

  // Move focus off the real composer first (the shortcut is ignored while
  // typing in a text field), then press "2" to pick the second option (Tokyo).
  await question.click();
  await page.keyboard.press("2");

  await expect(
    page.locator(".is-user").filter({ hasText: "Tokyo" }),
  ).toHaveCount(1);
});

/**
 * A mixed sequence (question THEN connect): answering the question advances the
 * SAME card to the connect step as the final step, with "Step 2 of 2" progress and
 * the rich integration connect card. (The connect can't complete real OAuth in
 * the harness, so this asserts the render, not the landing.) The composer stays
 * visible throughout, even mid-sequence.
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
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);

  // Answer the question -> advance to the connect step (2 of 2). The reason and
  // the rich IntegrationConnectCard (its Connect action is the proof it rendered)
  // now own the card body; the question text is gone.
  const freeText = page.getByPlaceholder("Type something else...");
  await freeText.fill("john@example.com");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // The composer stays visible and usable throughout, even mid-sequence.
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * A three-step sequence (question THEN signin THEN connect): answering the
 * question advances the SAME card to the signin step (2 of 3), which renders the
 * reason, the "Sign in to Houston" card, and a Sign in button. Real Google SSO
 * can't run in the harness, so this asserts the signin step RENDERS in the middle
 * of the sequence, not that it lands — the connect step (3 of 3) stays queued
 * behind it and the composer stays visible throughout.
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
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);

  // Answer the question -> advance to the SIGNIN step (2 of 3). Its reason, the
  // "Sign in to Houston" card and the Sign in button now own the card body; the
  // question text is gone and the connect step (3 of 3) is still queued behind it.
  const freeText = page.getByPlaceholder("Type something else...");
  await freeText.fill("john@example.com");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // The connect step hasn't been reached, and the composer stays visible.
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
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

  // The signin card shows above the composer: the reason plus the Sign in
  // button, a single step (no progress chrome), composer stays visible.
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * A connect-only sequence (single request_connection, no questions): the card
 * shows the reason plus the rich integration connect card as the ONLY step, with
 * no progress chrome, and the composer stays visible alongside it.
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

  // The connect card shows above the composer: the reason plus the rich
  // integration connect card, a single step (no progress), composer visible.
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(page.getByText(/ of /)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The connect step renders the app's REAL brand logo once the toolkits catalog
 * resolves (integrations armed): the fake host seeds slack with an inline
 * data-URI PNG, mirroring the Composio `meta.logo` production serves. This pins
 * the production regression where the card's pre-catalog favicon guess errored
 * and a sticky latch permanently shadowed the real logo (the icon never showed).
 * (slack, not gmail: the seed already holds an ACTIVE gmail connection, whose
 * connect step would self-report and retire the card before any assertion.)
 */
test("renders the app's real logo on the connect step once the catalog resolves", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "slack",
            reason: "I need Slack access to post the trip summary.",
          },
        ],
      },
    },
  });

  await startMission(page, "post the trip summary");

  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible({ timeout: 15_000 });
  // Scope to the interaction card: with integrations armed, other surfaces on
  // the page (the agent's integrations tab rows) list the same app.
  const card = page
    .locator("div.overflow-clip")
    .filter({ hasText: "I need Slack access to post the trip summary." });
  // The catalog identity joins the row: real name, one-line description, and
  // the brand image itself (the seeded data URI), never the letter fallback.
  await expect(card.getByText("Team messaging")).toBeVisible();
  const logo = card.getByRole("img", { name: "Slack" });
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/png/);
});

/**
 * Skipping a lone connect step: the ghost Skip beside the Connect pill advances
 * past the step without connecting, the card retires, and the sequence still
 * resumes the agent — the hidden auto-continue reply carries the skip fact
 * ("Skipped connecting Gmail.") so the agent hears the decline and does not
 * re-request the same app.
 */
test("skips a lone connect step and tells the agent the user declined", async ({
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

  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Skip" }).click();

  // The card retires (no soft-lock) and the hidden resume tells the agent the
  // user declined — the fake host echoes the message it received.
  await expect(page.getByText(/Skipped connecting Gmail\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * Skipping the connect step of a mixed (question then connect) sequence: the
 * answered question still composes the ONE visible structured reply, and the
 * skip line rides it so the transcript (and the agent) carry the decline.
 */
test("skipping the connect step of a mixed sequence keeps the answers and records the decline", async ({
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

  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  const freeText = page.getByPlaceholder("Type something else...");
  await freeText.fill("john@example.com");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();

  // ONE composed visible message: the typed answer plus the skip status line.
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "john@example.com" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Skipped connecting Gmail.");
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
});

/**
 * Skipping a lone signin step: the ghost Skip advances past the sign-in without
 * SSO (which can't run in the harness anyway), the card retires, and the hidden
 * resume tells the agent the user declined to sign in.
 */
test("skips a lone signin step and tells the agent the user declined", async ({
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

  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Skip" }).click();

  await expect(page.getByText(/Skipped signing in\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The escape hatch: instead of engaging with the card at all, the user can type
 * straight into the always-visible real composer. Sending that message abandons
 * the WHOLE pending interaction (mirrors clicking the card's own dismiss X) and
 * the typed text goes out as a normal message.
 */
test("typing a fresh message in the composer abandons the pending interaction", async ({
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
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });

  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();
  await composer.fill("actually just book the cheapest option");
  await composer.press("Enter");

  // The card retires entirely (question, options, and free-text field all gone)
  // and the typed message sends as a normal user turn, not an answer.
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type something else...")).toHaveCount(0);
  await expect(
    page
      .locator(".is-user")
      .filter({ hasText: "actually just book the cheapest option" }),
  ).toHaveCount(1);
});

/**
 * The explicit escape hatch: the card's own header X button abandons the whole
 * sequence without requiring the user to type anything.
 */
test("the dismiss X button abandons the pending interaction", async ({
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
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});
