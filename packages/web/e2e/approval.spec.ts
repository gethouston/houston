import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The `approval` interaction step (element 4, approval kind): a tool call the
 * host queued for the user's go-ahead. The turn ends on a `PendingInteraction`
 * whose step is `{ kind:"approval", id, toolkit, action, params?, paramsHash }`;
 * the SDK settles the board to `needs_you` and the app shows the shared
 * `InteractionModal` above the composer as a `ChatApprovalInteractionCard` — the
 * app identity lockup header, an "Allow {app} to {action}?" body over
 * muted-label / foreground-value param rows, and a three-way footer:
 * "Always allow" (outline, far LEFT), "Deny" (outline + Esc), "Allow once"
 * (filled + return glyph). Enter = Allow once, Esc = Deny.
 *
 * Deciding advances the stepper; an approval-ONLY sequence resumes the agent with
 * a HIDDEN auto-continue message (no user bubble; the fake host still RECEIVES it
 * and echoes it, which is what these specs assert on): approved →
 * "Approved: go ahead with <ACTION>.", denied →
 * "I chose not to allow <ACTION>. Do not retry it; continue without it.".
 * "Allow once" first POSTs `.../action-approvals/tickets {hash}`; "Always allow"
 * POSTs `.../action-approvals/always {action}` — the fake host records both, and
 * the `/__test__/action-approvals` window reads them back. The header X is NOT a
 * Deny: it interrupts the whole sequence (a Stop), covered by the dismiss specs.
 *
 * These drive the fake host's `/__test__/chat-interaction` control with the
 * `approval` step verbatim (the control is kind-agnostic), mirroring the
 * question/connect specs in interaction.spec.ts.
 */

const SHOTS =
  "/private/tmp/claude-501/-Users-ja-dev-houston/89dcedf6-5c2a-4e86-852c-1b2c0f455072/scratchpad/shots";

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

/**
 * The canonical lone Gmail approval step from the reference "Coworker card".
 *
 * `params` carry the DISPLAY-READY keys the host emits: the sandbox route runs
 * `displayParams`/`humanizeParamKey` before it puts the approval on the wire
 * ("draft_id" -> "Draft id", "to" -> "To"), and the card renders those keys
 * verbatim (its `params` prop is documented "display-ready"). The step is injected
 * straight as a `pendingInteraction` here (bypassing the sandbox route), so it
 * must already be in that humanized display form to mirror production faithfully.
 */
const gmailApprovalStep = {
  kind: "approval",
  id: "a1",
  toolkit: "gmail",
  action: "GMAIL_SEND_DRAFT",
  params: { "Draft id": "r-3003489618794597896", To: "john@acme.com" },
  paramsHash: "0123456789abcdef",
} as const;

async function armInteraction(page: Page, steps: unknown[]) {
  await page.request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps } },
  });
}

/** The fake host's read-back of the action-approval writes the card made. */
async function readApprovals(
  page: Page,
): Promise<{ always: string[]; tickets: string[] }> {
  const res = await page.request.get(
    `${FAKE_HOST_URL}/__test__/action-approvals`,
  );
  return (await res.json()) as { always: string[]; tickets: string[] };
}

/** The interaction card container (the shared InteractionModal surface). */
function approvalCard(page: Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "Allow Gmail to send draft?" });
}

/**
 * (1) The lone approval card renders the full reference lockup: the app NAME in
 * the header, the "Allow Gmail to send draft?" permission question, both param
 * rows (muted label + foreground value), and the three footer buttons. Also the
 * light-mode reference screenshots (element + chat-panel crop).
 */
test("renders the approval card with its params and three footer buttons", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");

  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });
  const card = approvalCard(page);

  // Header identity line: the app NAME (its own node, distinct from the "Gmail"
  // inside the permission question).
  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();

  // Both param rows: the muted humanized key AND the foreground value are on
  // screen (the host humanizes the key before the wire; the card renders it as-is).
  await expect(card.getByText("Draft id")).toBeVisible();
  await expect(card.getByText("r-3003489618794597896")).toBeVisible();
  await expect(card.getByText("To", { exact: true })).toBeVisible();
  await expect(card.getByText("john@acme.com")).toBeVisible();

  // The three footer decisions, correct copy.
  await expect(
    page.getByRole("button", { name: "Always allow" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Deny/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Allow once/ })).toBeVisible();

  // Reference screenshots (default light theme): the card element, then a
  // wider crop of the chat panel it sits in.
  await card.screenshot({ path: `${SHOTS}/approval-card-rest.png` });
  await page
    .locator("div.overflow-clip")
    .filter({ hasText: "Allow Gmail to send draft?" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${SHOTS}/approval-card-chatpanel.png`,
    clip: { x: 800, y: 0, width: 480, height: 720 },
  });
});

/** The footer button hover states (two shots), for the visual review. */
test("captures the footer hover states", async ({ page }) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });
  const card = approvalCard(page);

  await page.getByRole("button", { name: /Allow once/ }).hover();
  await card.screenshot({ path: `${SHOTS}/approval-hover-allow-once.png` });

  await page.getByRole("button", { name: "Always allow" }).hover();
  await card.screenshot({ path: `${SHOTS}/approval-hover-always-allow.png` });
});

/**
 * The header resolves the app's REAL brand logo once the toolkits catalog
 * settles (integrations armed): the fake host seeds gmail with an inline
 * data-URI PNG, mirroring production's Composio `meta.logo`. Without a catalog
 * (integrations off) the card shows the calm letter avatar instead — never a
 * broken image. This captures the faithful, reference-matching lockup and pins
 * that the approval card shares the connect card's logo-resolution path.
 */
test("renders the app's real logo in the header once the catalog resolves", async ({
  page,
}) => {
  await page.request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });
  const card = approvalCard(page);
  const logo = card.getByRole("img", { name: "Gmail" });
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/png/);
  await card.screenshot({ path: `${SHOTS}/approval-card-real-logo.png` });
});

/**
 * (2) Allow once: POSTs the step's fingerprint as a one-shot ticket (never an
 * always-allow), then resumes the agent with the HIDDEN approved continue — no
 * visible user bubble, but the fake host received (and echoes) the go-ahead.
 */
test("allow once posts the ticket and sends the hidden approved continue", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Allow once/ }).click();

  // The one-shot ticket for THIS step's hash landed; nothing was always-allowed.
  await expect
    .poll(async () => (await readApprovals(page)).tickets, { timeout: 10_000 })
    .toContain("0123456789abcdef");
  expect((await readApprovals(page)).always).toEqual([]);

  // The approved continue is HIDDEN: no user bubble carries it...
  await expect(
    page.locator(".is-user").filter({ hasText: "Approved: go ahead" }),
  ).toHaveCount(0);
  // ...but the fake host received it and echoes it back verbatim.
  await expect(
    page.getByText(/Approved: go ahead with GMAIL_SEND_DRAFT\./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
});

/**
 * (3a) Deny via the button: no ticket and no always-allow write, and the agent
 * hears the refusal through the hidden denied continue (which names the RAW
 * action slug so the model does not retry it).
 */
test("deny via the button writes nothing and sends the denied continue", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Deny/ }).click();

  await expect(
    page.getByText(
      /I chose not to allow GMAIL_SEND_DRAFT\. Do not retry it; continue without it\./,
    ),
  ).toBeVisible({ timeout: 15_000 });
  // Deny is a decision, not a store write: neither list gained an entry.
  const approvals = await readApprovals(page);
  expect(approvals.tickets).toEqual([]);
  expect(approvals.always).toEqual([]);
  // Hidden: no visible user bubble carried the refusal.
  await expect(
    page.locator(".is-user").filter({ hasText: "I chose not to allow" }),
  ).toHaveCount(0);
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
});

/**
 * (3b) Deny via Esc: with focus off the composer, Escape fires the Deny path
 * (mirroring the footer's Esc keycap) — same refusal, no store write.
 */
test("deny via Esc sends the denied continue", async ({ page }) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  const title = page.getByText("Allow Gmail to send draft?");
  await expect(title).toBeVisible({ timeout: 15_000 });

  // Move focus off the real composer (the Enter/Esc shortcuts are ignored while
  // a text field has focus), then press Escape to deny.
  await title.click();
  await page.keyboard.press("Escape");

  await expect(
    page.getByText(
      /I chose not to allow GMAIL_SEND_DRAFT\. Do not retry it; continue without it\./,
    ),
  ).toBeVisible({ timeout: 15_000 });
  const approvals = await readApprovals(page);
  expect(approvals.tickets).toEqual([]);
  expect(approvals.always).toEqual([]);
  await expect(title).toHaveCount(0);
});

/**
 * (4) Always allow: POSTs the action to the always-allow list (no per-call
 * ticket), then resumes the agent with the same hidden approved continue.
 */
test("always allow posts the action and sends the approved continue", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Always allow" }).click();

  await expect
    .poll(async () => (await readApprovals(page)).always, { timeout: 10_000 })
    .toContain("GMAIL_SEND_DRAFT");
  expect((await readApprovals(page)).tickets).toEqual([]);

  await expect(
    page.getByText(/Approved: go ahead with GMAIL_SEND_DRAFT\./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
});

/**
 * The pager's decided state: in a two-approval sequence, denying step 1 advances
 * to step 2; walking Back onto step 1 shows the calm "Denied" record (no footer)
 * instead of re-offering the buttons — the forward chevron is the way onward.
 * Doubles as the resolved/denied reference screenshot.
 */
test("walking Back onto a denied approval shows the calm decided state", async ({
  page,
}) => {
  await armInteraction(page, [
    gmailApprovalStep,
    {
      kind: "approval",
      id: "a2",
      toolkit: "github",
      action: "GITHUB_CREATE_ISSUE",
      params: { title: "Track the rollout" },
      paramsHash: "fedcba9876543210",
    },
  ]);
  await startMission(page, "send the draft then file the issue");

  // 1 of 2: deny the Gmail step -> advance to the GitHub step (2 of 2).
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Deny/ }).click();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(page.getByText("Allow Github to create issue?")).toBeVisible();

  // Back onto the denied Gmail step: the calm "Denied" record, no footer buttons.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  const card = approvalCard(page);
  await expect(card.getByText("Denied", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Deny/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Always allow" })).toHaveCount(
    0,
  );
  await card.screenshot({ path: `${SHOTS}/approval-card-denied-state.png` });
});

/**
 * (5a) Dismiss X on an approval step = user interruption (a Stop, NOT a Deny):
 * the card vanishes at once, the transcript shows the standard "Stopped by user"
 * line, and after a reload the persisted interaction is gone — reopening the
 * mission shows no card, only the stop marker. (A non-dismissed interaction
 * WOULD reappear on reopen; the persist path is real.)
 */
test("dismiss X on an approval step interrupts and clears the persisted card", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the quarterly report");
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Dismiss" }).click();

  // Card gone instantly; the transcript reads the standard stop line.
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
  await expect(page.getByText("Stopped by user")).toBeVisible();
  await page.screenshot({
    path: `${SHOTS}/approval-dismiss-interrupted.png`,
    clip: { x: 800, y: 0, width: 480, height: 720 },
  });

  // Reload + reopen the mission from the board: the card stays gone (persisted
  // interaction cleared), the stop marker persists.
  await page.reload();
  await page.getByText("send the quarterly report").first().click();
  await expect(page.getByText("Stopped by user")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
});

/**
 * (5b) The same interrupt on a plain QUESTION step — dismiss is kind-agnostic:
 * card gone, "Stopped by user" in the transcript, and the persisted interaction
 * is cleared across a reload.
 */
test("dismiss X on a question step interrupts and clears the persisted card", async ({
  page,
}) => {
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
  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Dismiss" }).click();

  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByText("Stopped by user")).toBeVisible();

  await page.reload();
  await page.getByText("plan the offsite").first().click();
  await expect(page.getByText("Stopped by user")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
});

/**
 * (6) A mixed compose (question THEN approval): answering the question then
 * allowing the approval completes the sequence as ONE VISIBLE structured user
 * message that carries BOTH the typed answer and the HUMANIZED approved line (a
 * sequence with questions sends visibly, unlike an approval-only one). The
 * visible bubble reads "Allowed Gmail to send draft." for a non-technical user;
 * the raw slug the model re-issues rides the hidden body, not this bubble.
 */
test("composes one visible message from a question then an approval", async ({
  page,
}) => {
  await armInteraction(page, [
    {
      kind: "question",
      id: "q1",
      question: "Who should I send the draft to?",
    },
    gmailApprovalStep,
  ]);
  await startMission(page, "send the draft to the team");

  // 1 of 2: the question (free text). Answer it -> advance to the approval.
  await expect(page.getByText("Who should I send the draft to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 2")).toBeVisible();
  const freeText = page.getByPlaceholder("Type another option...");
  await freeText.fill("john@acme.com");
  await freeText.press("Enter");

  // 2 of 2: the approval. Allow once completes and composes the one message.
  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(page.getByText("Allow Gmail to send draft?")).toBeVisible();
  await page.getByRole("button", { name: /Allow once/ }).click();

  // Exactly ONE visible user message, carrying the answer AND the HUMANIZED
  // approved line (the raw slug lives only in the hidden model-facing body).
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "john@acme.com" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Allowed Gmail to send draft.");
  await expect(composed).not.toContainText("GMAIL_SEND_DRAFT");
  await expect(page.getByText("Allow Gmail to send draft?")).toHaveCount(0);
});

/**
 * (4, owner design tweak) The QUESTION card's "Skip" beside the free-text field
 * is a bordered outline pill with an Esc keycap — a clickable affordance, not a
 * quiet ghost link. Captured at rest and on hover for the visual review.
 */
test("the question Skip is a bordered outline pill (rest + hover)", async ({
  page,
}) => {
  await armInteraction(page, [
    {
      kind: "question",
      id: "q1",
      question: "Anything special I should know about the trip?",
    },
  ]);
  await startMission(page, "plan my trip");
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible({ timeout: 15_000 });

  const card = page
    .locator("div.overflow-clip")
    .filter({ hasText: "Anything special I should know about the trip?" });
  const skip = page.getByRole("button", { name: /Skip/ });
  await expect(skip).toBeVisible();

  await card.screenshot({ path: `${SHOTS}/question-skip-rest.png` });
  await skip.hover();
  await card.screenshot({ path: `${SHOTS}/question-skip-hover.png` });

  // It is genuinely clickable: clicking skips the (lone) question.
  await skip.click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
});
