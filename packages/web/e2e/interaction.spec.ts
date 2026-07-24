import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * Element 4 (v3): the pending-interaction hand-off, a STEPPER. When a turn
 * ends on an `ask_user` / `request_connection`, its `done` frame carries a
 * `PendingInteraction { steps }`; the SDK settles the board to `needs_you` and
 * the app shows ONE `ChatInteractionCard` in the composer's slot, REPLACING it
 * (HOU-870) — the card's own free-text row is the ONE text input on screen, no
 * "Send a follow-up..." below it — and walks the user through the steps ONE AT
 * A TIME with a compact "N of M" pager (its chevrons are Back/Forward). The
 * card's dismiss X abandons the whole sequence and restores the composer. These
 * specs arm the fake host's `/__test__/chat-interaction` control with the
 * `{ steps }` shape, then drive the whole seam: card replaces the composer ->
 * user answers each step (or dismisses) -> card retires, composer returns.
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
 * compact "N of M" pager. Answer step 1 by option, step 2 by free text, step 3
 * by option; the completion composes ONE structured user message carrying all
 * three answers, and the normal follow-up composer (replaced by the card while
 * it walked the steps) returns as all that's left.
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

  // 1 of 3 only: the first question, its options, the always-visible input.
  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 3")).toBeVisible();
  // The other questions are NOT on screen yet (one step at a time).
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByText("Morning or evening flight?")).toHaveCount(0);

  // Exactly this step's two options, plus the free-text ESCAPE row (which, when
  // options are present, carries the escape placeholder). The card REPLACES the
  // composer, so the card's own input is the ONE text field on screen: the
  // "Send a follow-up..." composer is not rendered under it.
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder("Type another option...")).toBeVisible();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toHaveCount(0);

  // Answer step 1 by option -> advances to 2 of 3 (a free-text-only question).
  // On a multi-step sequence the click advances, it does not send.
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible();
  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  // Still mid-sequence: the composer stays replaced by the card.
  await expect(composer).toHaveCount(0);

  // Answer step 2 by free text -> advances to 3 of 3. A free-text-only question
  // has no options, so its escape row shows the neutral placeholder; Enter in
  // the field commits the draft (there is no footer Next button anymore).
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("Window seat please");
  await freeText.press("Enter");
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

  // The pager's back chevron -> step 1 again, Paris pre-selected (committed).
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

  // The lone question REPLACES the composer; a single step shows NO
  // progress chrome and NO back chevron (the one-tap feel is preserved).
  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  const morning = page.getByRole("radio", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  // Card in the composer's slot: the follow-up input is not on screen.
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

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

  // 1 of 2: the question, free-text only (no options), no connect card yet.
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);

  // Answer the question (Enter commits the free-text draft) -> advance to the
  // connect step (2 of 2). The app NAME is the identity line, the reason is the
  // foreground body line, and the Connect CTA owns the footer; the question is gone.
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible();
  // The identity line is the integration name (its own element, not the reason
  // sentence that also mentions "Gmail").
  const connectCard = page.locator("div.overflow-clip").filter({
    hasText: "I need access to your Gmail to send the trip itinerary.",
  });
  await expect(connectCard.getByText("Gmail", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // Mid-sequence: the connect card holds the composer's slot (no follow-up input).
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
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

  // 1 of 3: the question, free-text only. No signin/connect surface yet.
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);

  // Answer the question (Enter commits) -> advance to the SIGNIN step (2 of 3).
  // "Houston" is the identity line, its reason the foreground body line, and the
  // Sign in button the footer; the question is gone, the connect (3 of 3) queued.
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toBeVisible();
  // The identity line is the "Houston" name (its own element, not the reason
  // sentence that also mentions Houston).
  const signinCard = page.locator("div.overflow-clip").filter({
    hasText: "Sign in to Houston so I can send email on your behalf.",
  });
  await expect(signinCard.getByText("Houston", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  // The connect step hasn't been reached, and the signin card holds the
  // composer's slot (no follow-up input while a step is pending).
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

  // The signin card REPLACES the composer: the reason plus the Sign in button,
  // a single step (no progress chrome), the follow-up input not on screen.
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
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

  // The connect card REPLACES the composer: the reason plus the rich integration
  // connect card, a single step (no progress), the follow-up input not on screen.
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
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
 * Skipping a lone connect step: the quiet "Skip" (Esc) beside the Connect
 * pill advances past the step without connecting, the card retires, and the
 * sequence still resumes the agent — the hidden auto-continue reply carries the
 * skip fact ("Skipped connecting Gmail.") so the agent hears the decline and
 * does not re-request the same app.
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
  await page.getByRole("button", { name: /Skip/ }).click();

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
 * The always-visible free-text row on a connect step (HOU-870): instead of
 * connecting, the user types "or tell it what to do instead" and sends. That
 * records a decline WITH the instruction, which — because it carries user text —
 * resumes the agent VISIBLY (a user bubble the transcript shows), naming the app
 * and the verbatim instruction so the agent reacts instead of re-requesting the
 * connection. No connection is made.
 */
test("declines a connect step with a typed instruction and resumes visibly", async ({
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

  // The decline row is the ONE text input on screen (the composer is replaced).
  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  await row.fill("just draft it, I'll send it from my phone");
  await row.press("Enter");

  // VISIBLE resume: a user bubble carries the humanized decline-with-instruction
  // (naming the app), and the card retires so the composer returns.
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "just draft it, I'll send it from my phone" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("I didn't connect Gmail. Instead");
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
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
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  // ONE composed visible message: the typed answer plus the skip status line.
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "john@example.com" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Skipped connecting Gmail.");
  await expect(page.getByRole("button", { name: "Connect" })).toHaveCount(0);
});

/**
 * Reconsider a skipped connect step (the revisit-reconnect fix): skipping a
 * connect advances the sequence, but walking Back onto the skipped step must
 * offer its Connect button AGAIN — a skipped step is still actionable, unlike a
 * completed one whose only affordance is Forward. Connecting it there COMMITS
 * (the earlier skip is undone), so the composed reply reports "Connected {app}."
 * for the reconsidered app, never a stale "Skipped connecting {app}." — while a
 * genuinely-declined app still reports skipped. Integrations are armed so the
 * fake host can LAND the OAuth (a control flips the pending connection active),
 * proving the reconsider all the way through to the composed reply.
 */
test("reconsiders a skipped connect step: Back offers Connect again and reports Connected", async ({
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
          {
            kind: "connect",
            id: "c2",
            toolkit: "github",
            reason: "I need GitHub access to open the tracking issue.",
          },
        ],
      },
    },
  });

  await startMission(page, "post the trip summary");

  // 1 of 2: the Slack connect step (unconnected). Skip -> step 2 (GitHub).
  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need GitHub access to open the tracking issue."),
  ).toBeVisible();

  // The pager's back chevron onto the SKIPPED Slack step: its Connect button is
  // offered AGAIN (the fix — a revisited skipped step stays actionable, and the
  // pager's forward chevron is the "keep it skipped" path).
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect" });
  await expect(connect).toBeVisible();
  // The decline affordance travels WITH the Connect CTA: "Skip" is offered on
  // a revisited/reconsidered step too, never a dead end with only Connect.
  await expect(page.getByRole("button", { name: /Skip/ })).toBeVisible();

  // Connect it. The fake host mints a PENDING connection on connect; flip it
  // active (models the OAuth completing) so the card self-reports and advances.
  await connect.click();
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${FAKE_HOST_URL}/v1/integrations/composio/connections`,
        );
        const { items } = (await res.json()) as {
          items: { toolkit: string; connectionId: string; status: string }[];
        };
        const pending = items.find(
          (c) => c.toolkit === "slack" && c.status === "pending",
        );
        if (!pending) return false;
        await request.post(`${FAKE_HOST_URL}/__test__/integrations-activate`, {
          data: { connectionId: pending.connectionId },
        });
        return true;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  // The connection lands -> Slack advances to the GitHub step (2 of 2). Decline
  // GitHub genuinely ("Skip") to finish the sequence.
  await expect(page.getByText("2 of 2")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("I need GitHub access to open the tracking issue."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  // The composed reply reports the RECONSIDERED Slack as connected (never a
  // stale skip line) and the genuinely-declined GitHub as skipped. The fake
  // host echoes the hidden auto-continue message it received.
  await expect(page.getByText(/Connected Slack\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Skipped connecting GitHub\./)).toBeVisible();
  await expect(page.getByText(/Skipped connecting Slack\./)).toHaveCount(0);
});

/**
 * Skipping a lone signin step: the quiet "Skip" advances past the sign-in
 * without SSO (which can't run in the harness anyway), the card retires, and the
 * hidden resume tells the agent the user declined to sign in.
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
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText(/Skipped signing in\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The free-text row on a signin step (HOU-870): instead of signing in, the user
 * types what to do instead and sends. The decline carries the instruction, so it
 * resumes the agent VISIBLY (a user bubble) rather than the hidden signin-only
 * followup, telling the agent to proceed a different way.
 */
test("declines a signin step with a typed instruction and resumes visibly", async ({
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

  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  await row.fill("skip the connected apps, just search the web");
  await row.press("Enter");

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "skip the connected apps, just search the web" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("I didn't sign in. Instead");
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The card REPLACES the composer (HOU-870): while a step is pending the
 * "Send a follow-up..." input is not on screen, so the card's own free-text row
 * is the ONE text input (no two competing inputs). The header X restores the
 * composer — the only way to leave the card without deciding, now that the
 * composer is not sitting below it to type into.
 */
test("the card replaces the composer and dismiss restores it", async ({
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

  // Exactly ONE text input on screen: the card's own, not the composer.
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type another option...")).toHaveCount(1);

  // The header X retires the card and RESTORES the composer.
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type another option...")).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The Recommended chip renders; option descriptions do NOT. The `description`
 * field is still tolerated on the wire (older steps may carry it), but the card
 * shows label + Recommended chip only — restraint, matching the reference. The
 * single option marked `recommended` shows a soft "Recommended" chip; the
 * unmarked one shows none. A single-question fast path, so clicking the
 * recommended option completes and sends immediately.
 */
test("renders the Recommended chip and never the option description", async ({
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
            question: "Which sample automation should we design?",
            options: [
              {
                id: "tasks",
                label: "Task tracker",
                description: "Owners, due dates, statuses, and overdue work.",
                recommended: true,
              },
              {
                id: "sales",
                label: "Sales pipeline",
                description: "Leads, stages, follow-ups, and estimated value.",
              },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "build a spreadsheet");

  await expect(
    page.getByText("Which sample automation should we design?"),
  ).toBeVisible({ timeout: 15_000 });

  // Both labels render; NEITHER description does (the field is tolerated but
  // never shown).
  await expect(page.getByRole("radio", { name: /Task tracker/ })).toBeVisible();
  await expect(
    page.getByText("Owners, due dates, statuses, and overdue work."),
  ).toHaveCount(0);
  await expect(
    page.getByText("Leads, stages, follow-ups, and estimated value."),
  ).toHaveCount(0);
  // Exactly one option is marked recommended -> exactly one Recommended chip.
  await expect(page.getByText("Recommended")).toHaveCount(1);

  // Fast path: clicking the recommended option completes and sends its label.
  await page.getByRole("radio", { name: /Task tracker/ }).click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Task tracker" }),
  ).toHaveCount(1);
});

/**
 * The question card's card-wide decline moved OUT of the free-text escape row
 * and into the modal footer as the unified "Skip" + Esc — one label shared
 * with the sign-in/connect steps. Clicking it skips the (lone) question, so the
 * sequence resolves with no answer and the composer stands alone again.
 */
test("skips a question from the footer's unified Skip", async ({
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
            question: "Anything special I should know about the trip?",
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible({ timeout: 15_000 });
  // The decline lives in the footer now, not as a pill inside the input.
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 15_000,
  });
});

/**
 * Esc declines a connect step: with focus off the composer, pressing Escape
 * fires the "Skip" path (mirroring the footer's Esc hint), so the card
 * retires and the hidden resume tells the agent the user declined — exactly like
 * clicking "Skip".
 */
test("pressing Esc declines a lone connect step", async ({ page, request }) => {
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

  const reason = page.getByText(
    "I need access to your Gmail to send the trip itinerary.",
  );
  await expect(reason).toBeVisible({ timeout: 15_000 });
  // Move focus off the real composer (the Esc/Enter shortcuts are ignored while
  // a text field has focus), then press Escape to decline.
  await reason.click();
  await page.keyboard.press("Escape");

  await expect(page.getByText(/Skipped connecting Gmail\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(reason).toHaveCount(0);
});

/**
 * The credential step (HOU-550, PR #825): a `request_credential` interaction the
 * agent raises when a custom integration still needs its API key. It renders as a
 * first-class citizen of the shared `InteractionModal` shell — a KeyRound glyph
 * beside the integration NAME (resolved from the custom-integrations list by
 * `slug === step.toolkit`), the agent's reason over a muted "stored securely"
 * subtitle, the secure key form (one password input per auth field), and the
 * unified "Skip" (Esc) + "Save key" (Enter) footer. Saving POSTs the secret to
 * the per-agent surface `/agents/:id/integrations/custom/definitions/:slug/
 * credential` (HOU-823 — the one form the hosted gateway proxies to the pod;
 * the old top-level form 404ed there and failed every managed-cloud save) and
 * resumes the agent
 * with a hidden auto-continue ("I've added the {name} key. Please continue.");
 * skipping resumes it with "Skipped adding the {name} key." — a decline the agent
 * MUST hear, or it waits on a key that never comes. These arm the SAME
 * `/__test__/chat-interaction` control with a `credential` step, plus the
 * `/__test__/custom-integrations` seed so the slug resolves to a real NAME.
 */

/** The absolute path for the light-theme reference shot of the credential card. */

/** A pending custom integration whose slug the credential step names. Its auth
 *  method's field label ("API key (X-Api-Key)") is the key input's <label>. */
const ACME_PENDING = {
  slug: "acme_crm",
  name: "Acme CRM",
  kind: "openapi",
  displayUrl: "https://api.acme.test/openapi.json",
  addedAtMs: 0,
  state: {
    status: "pending",
    authMethods: [
      {
        template: "apikey-0",
        label: "API key (X-Api-Key)",
        fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
      },
    ],
  },
  authMethods: [
    {
      template: "apikey-0",
      label: "API key (X-Api-Key)",
      fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
    },
  ],
} as const;

/** Arm the custom provider + a pending integration so the credential step's slug
 *  resolves to a real NAME (and the credential POST has a definition to flip). */
async function armCustomIntegration(
  request: import("@playwright/test").APIRequestContext,
) {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["custom"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
    data: { items: [ACME_PENDING] },
  });
}

/** The credential card container (the shared InteractionModal surface), scoped by
 *  the reason line so the assertions never collide with the Integrations tab. */
function credentialCard(page: import("@playwright/test").Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "I need your API key to sync your records." });
}

const credentialStep = {
  kind: "credential",
  id: "k1",
  toolkit: "acme_crm",
  reason: "I need your API key to sync your records.",
} as const;

/**
 * The lone credential step renders the full shell lockup — the integration NAME
 * in the header (resolved from the slug), the agent's reason, the "stored
 * securely" subtitle, the labeled key input, and the "Save key" + "Skip" footer.
 * Filling the key + Save stores the secret and resumes the agent with the hidden
 * auto-continue the fake host echoes back. Also captures the light-theme shot.
 */
test("renders the credential card, saves the key, and resumes the agent", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  // The reason line anchors the card; a single step shows no progress chrome.
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  const card = credentialCard(page);

  // Header identity: the integration NAME (its own node, resolved from the slug),
  // never the bare "acme_crm" slug fallback.
  await expect(card.getByText("Acme CRM", { exact: true })).toBeVisible();
  await expect(card.getByText("acme_crm")).toHaveCount(0);
  // The muted "stored securely" reassurance subtitle.
  await expect(
    card.getByText(
      "Paste it below. It is stored securely and never shown in chat.",
    ),
  ).toBeVisible();

  // The secure key field: a labeled password input with the "Paste your key"
  // placeholder — the secret crosses HTTPS only, never the transcript.
  const keyField = page.getByLabel("API key (X-Api-Key)");
  await expect(keyField).toBeVisible();
  await expect(keyField).toHaveAttribute("type", "password");
  await expect(keyField).toHaveAttribute("placeholder", "Paste your key");

  // The footer: Skip (always available) and Save key (gated until the field is
  // filled — a submit button, so Enter in the field also saves).
  const skip = page.getByRole("button", { name: /Skip/ });
  const save = page.getByRole("button", { name: "Save key" });
  await expect(skip).toBeVisible();
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();

  // Light-theme reference shot of the card element (not the full page).

  // Fill the key -> Save enables. Store it -> the sequence completes and resumes
  // the agent with the hidden auto-continue; the fake host echoes it back.
  await keyField.fill("sk_live_acme_42");
  await expect(save).toBeEnabled();
  await save.click();

  await expect(
    page.getByText(/I've added the Acme CRM key\. Please continue\./),
  ).toBeVisible({ timeout: 15_000 });
  // The card retires and the composer stands alone again.
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * Skipping the credential step: the quiet "Skip" (Esc) beside "Save key" advances
 * past the step without a secret, the card retires, and the sequence still
 * resumes the agent — the hidden auto-continue carries the decline fact
 * ("Skipped adding the Acme CRM key.") so the agent stops waiting on a key that
 * never comes.
 */
test("skips the credential step and tells the agent the key was declined", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  const card = credentialCard(page);
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("Acme CRM", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Skip/ }).click();

  // The decline rides the hidden resume the fake host echoes back verbatim.
  await expect(page.getByText(/Skipped adding the Acme CRM key\./)).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save key" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * The free-text row on a credential step (HOU-870): instead of pasting the key,
 * the user types what to do instead and sends. The secret never enters the
 * transcript; the decline carries the instruction, resuming the agent VISIBLY
 * (a user bubble naming the integration) so it proceeds a different way.
 */
test("declines the credential step with a typed instruction and resumes visibly", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });

  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  await row.fill("read the key from the ACME_KEY environment variable");
  await row.press("Enter");

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "read the key from the ACME_KEY environment variable" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText(
    "I didn't add the Acme CRM key. Instead",
  );
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/**
 * Enter connects a connect step: with focus off the composer, pressing Enter
 * fires the Connect flow (mirroring the pill's return-key glyph). Integrations
 * are armed so the fake host mints a pending connection on connect; activating
 * it (models the OAuth completing) lets the card self-report and resume the
 * agent with "Connected Slack.".
 */
test("pressing Enter connects a lone connect step", async ({
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

  const reason = page.getByText(
    "I need Slack access to post the trip summary.",
  );
  await expect(reason).toBeVisible({ timeout: 15_000 });
  // Blur the composer, then press Enter to connect (instead of clicking Connect).
  await reason.click();
  await page.keyboard.press("Enter");

  // Enter fired startConnect: the fake host mints a PENDING slack connection.
  // Flip it active (models the OAuth completing) so the card self-reports.
  await expect
    .poll(
      async () => {
        const res = await request.get(
          `${FAKE_HOST_URL}/v1/integrations/composio/connections`,
        );
        const { items } = (await res.json()) as {
          items: { toolkit: string; connectionId: string; status: string }[];
        };
        const pending = items.find(
          (c) => c.toolkit === "slack" && c.status === "pending",
        );
        if (!pending) return false;
        await request.post(`${FAKE_HOST_URL}/__test__/integrations-activate`, {
          data: { connectionId: pending.connectionId },
        });
        return true;
      },
      { timeout: 10_000 },
    )
    .toBe(true);

  // The connection lands -> the card self-reports and resumes the agent (the
  // composed "Connected Slack." resume plus its echo can appear more than once).
  await expect(page.getByText(/Connected Slack\./).first()).toBeVisible({
    timeout: 15_000,
  });
});
