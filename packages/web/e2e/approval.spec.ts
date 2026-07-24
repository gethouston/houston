import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The `approval` interaction step (element 4, approval kind): a tool call the
 * host queued for the user's go-ahead. The turn ends on a `PendingInteraction`
 * whose step is `{ kind:"approval", id, toolkit, action, intent?, params?,
 * paramsHash }`; the SDK settles the board to `needs_you` and the app shows the
 * shared `InteractionModal` above the composer as a `ChatApprovalInteractionCard`
 * — the app identity lockup header, a plain confirmation question (the agent's
 * `intent` when it phrased one, else the generic "{action} with {app}?" fallback;
 * the raw params ride the wire but never render), an always-visible free-text row
 * (confirm, or type what to do differently), and a two-way footer: "Not now"
 * (outline + Esc) and "Do it" (filled + return glyph). Enter = Do it, Esc = Not
 * now. There is NO "Always allow" — a confirmation, not a durable grant UI.
 *
 * Deciding advances the stepper. A confirm/decline-only sequence resumes the
 * agent with a HIDDEN auto-continue message (no user bubble; the fake host still
 * RECEIVES it and echoes it, which is what these specs assert on): "Do it" →
 * "Approved: go ahead with <ACTION>. ...", "Not now" →
 * "I chose not to allow <ACTION>. Do not retry it; continue without it.". A
 * "differently" redirection carries user-typed text, so it resumes VISIBLY. Only
 * "Do it" writes to the host: it POSTs `.../action-approvals/grants {action}`,
 * which the fake host records and the `/__test__/action-approvals` window reads
 * back as `{ grants }`. The header X is NOT a "Not now": it interrupts the whole
 * sequence (a Stop), covered by the dismiss specs.
 *
 * These drive the fake host's `/__test__/chat-interaction` control with the
 * `approval` step verbatim (the control is kind-agnostic), mirroring the
 * question/connect specs in interaction.spec.ts.
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

/**
 * The canonical lone Gmail approval step from the reference "Coworker card". No
 * `intent`, so the card renders the generic "{action} with {app}?" fallback
 * ("send draft with Gmail?").
 *
 * `params` carry the DISPLAY-READY keys the host emits; the card no longer
 * renders them (they're technical detail), but the wire payload shape is
 * unchanged, so the step injected straight as a `pendingInteraction` here still
 * mirrors production's humanized display form faithfully.
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

/** The fake host's read-back of the action-approval grants the card made. */
async function readGrants(page: Page): Promise<string[]> {
  const res = await page.request.get(
    `${FAKE_HOST_URL}/__test__/action-approvals`,
  );
  return ((await res.json()) as { grants: string[] }).grants;
}

/** The interaction card container (the shared InteractionModal surface). */
function approvalCard(page: Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "send draft with Gmail?" });
}

/**
 * (1) The lone approval card renders the calm reference lockup: the app NAME in
 * the header, the "send draft with Gmail?" confirmation question, the free-text
 * redirection row, and the two footer buttons — NO "Always allow", and NO
 * technical param rows (dropped by design; the wire still carries params, the
 * card never shows them).
 */
test("renders the confirmation card with the question, redirection row, and two footer buttons", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");

  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });
  const card = approvalCard(page);

  // Header identity line: the app NAME (its own node, distinct from the "Gmail"
  // inside the confirmation question).
  await expect(card.getByText("Gmail", { exact: true })).toBeVisible();

  // The technical param rows are gone by design: the step's params ride the
  // wire, but neither the humanized keys nor the raw values ever render.
  await expect(card.getByText("Draft id")).toHaveCount(0);
  await expect(card.getByText("r-3003489618794597896")).toHaveCount(0);
  await expect(card.getByText("john@acme.com")).toHaveCount(0);

  // The always-visible redirection row (never hover-gated).
  await expect(
    card.getByPlaceholder("Or tell it what to do differently..."),
  ).toBeVisible();

  // The two footer decisions, correct copy — and NO "Always allow".
  await expect(page.getByRole("button", { name: /Not now/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Do it/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Always allow" })).toHaveCount(
    0,
  );
});

/** A step whose agent phrased an `intent` shows THAT question, not the generic
 *  "{action} with {app}?" fallback. */
test("renders the agent-phrased intent when present", async ({ page }) => {
  await armInteraction(page, [
    { ...gmailApprovalStep, intent: "Should I send the draft to John?" },
  ]);
  await startMission(page, "send the draft");

  await expect(page.getByText("Should I send the draft to John?")).toBeVisible({
    timeout: 15_000,
  });
  // The generic fallback is NOT shown when an intent is supplied.
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
});

/** Hovering either footer action keeps it enabled and clickable (no
 *  hover-gated affordance regression). */
test("footer actions stay enabled under hover", async ({ page }) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });

  const doIt = page.getByRole("button", { name: /Do it/ });
  await doIt.hover();
  await expect(doIt).toBeEnabled();

  const notNow = page.getByRole("button", { name: /Not now/ });
  await notNow.hover();
  await expect(notNow).toBeEnabled();
});

/**
 * The header resolves the app's REAL brand logo once the toolkits catalog
 * settles (integrations armed): the fake host seeds gmail with an inline
 * data-URI PNG, mirroring production's Composio `meta.logo`. Without a catalog
 * the card shows the calm letter avatar instead — never a broken image.
 */
test("renders the app's real logo in the header once the catalog resolves", async ({
  page,
}) => {
  await page.request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });
  const card = approvalCard(page);
  const logo = card.getByRole("img", { name: "Gmail" });
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/png/);
});

/**
 * (2) Do it: grants the step's action (cleared to run without another
 * confirmation), then resumes the agent with the HIDDEN approved continue — no
 * visible user bubble, but the fake host received (and echoes) the go-ahead.
 */
test("do it grants the action and sends the hidden approved continue", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Do it/ }).click();

  // The action was granted for this agent.
  await expect
    .poll(async () => readGrants(page), { timeout: 10_000 })
    .toContain("GMAIL_SEND_DRAFT");

  // The approved continue is HIDDEN: no user bubble carries it...
  await expect(
    page.locator(".is-user").filter({ hasText: "Approved: go ahead" }),
  ).toHaveCount(0);
  // ...but the fake host received it and echoes it back verbatim.
  await expect(
    page.getByText(/Approved: go ahead with GMAIL_SEND_DRAFT\./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
});

/**
 * (3a) Not now via the button: no grant write, and the agent hears the refusal
 * through the hidden denied continue (which names the RAW action slug so the
 * model does not retry it).
 */
test("not now via the button writes nothing and sends the denied continue", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: /Not now/ }).click();

  await expect(
    page.getByText(
      /I chose not to allow GMAIL_SEND_DRAFT\. Do not retry it; continue without it\./,
    ),
  ).toBeVisible({ timeout: 15_000 });
  // Not now is a decision, not a grant write: nothing was granted.
  expect(await readGrants(page)).toEqual([]);
  // Hidden: no visible user bubble carried the refusal.
  await expect(
    page.locator(".is-user").filter({ hasText: "I chose not to allow" }),
  ).toHaveCount(0);
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
});

/**
 * (3b) Not now via Esc: with focus off the composer, Escape fires the Not now
 * path (mirroring the footer's Esc keycap) — same refusal, no grant write.
 */
test("not now via Esc sends the denied continue", async ({ page }) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  const title = page.getByText("send draft with Gmail?");
  await expect(title).toBeVisible({ timeout: 15_000 });

  // Move focus off the real composer (the Enter/Esc shortcuts are ignored while
  // a text field has focus), then press Escape to decline.
  await title.click();
  await page.keyboard.press("Escape");

  await expect(
    page.getByText(
      /I chose not to allow GMAIL_SEND_DRAFT\. Do not retry it; continue without it\./,
    ),
  ).toBeVisible({ timeout: 15_000 });
  expect(await readGrants(page)).toEqual([]);
  await expect(title).toHaveCount(0);
});

/**
 * (4) Differently: typing a redirection into the free-text row and sending it
 * writes NO grant, resumes the agent VISIBLY (the user typed content the
 * transcript should show), and the visible bubble names the HUMANIZED action
 * plus the verbatim text — never the raw slug (that rides the hidden body the
 * model reads and re-issues an adjusted call from).
 */
test("differently sends the redirection visibly and writes no grant", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the draft");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });

  const row = page.getByPlaceholder("Or tell it what to do differently...");
  await row.fill("make it shorter and add a greeting");
  await row.press("Enter");

  // Visible: the user's redirection shows as a user bubble with the HUMANIZED
  // line (no raw slug).
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "make it shorter and add a greeting" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText(
    "Asked Gmail to send draft differently:",
  );
  await expect(composed).not.toContainText("GMAIL_SEND_DRAFT");

  // No grant was written — a redirection is not a confirmation.
  expect(await readGrants(page)).toEqual([]);
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
});

/**
 * The pager's decided state: in a two-approval sequence, declining step 1
 * advances to step 2; walking Back onto step 1 shows the calm "Not now" record
 * (no footer) instead of re-offering the controls — the forward chevron is the
 * way onward.
 */
test("walking Back onto a declined approval shows the calm decided state", async ({
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

  // 1 of 2: decline the Gmail step -> advance to the GitHub step (2 of 2).
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Not now/ }).click();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(page.getByText("create issue with Github?")).toBeVisible();

  // Back onto the declined Gmail step: the calm "Not now" record, no footer.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  const card = approvalCard(page);
  await expect(card.getByText("Not now", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Do it/ })).toHaveCount(0);
});

/**
 * (5a) Dismiss X on an approval step = user interruption (a Stop, NOT a Not
 * now): the card vanishes at once, the transcript shows the standard "Stopped by
 * user" line, and after a reload the persisted interaction is gone.
 */
test("dismiss X on an approval step interrupts and clears the persisted card", async ({
  page,
}) => {
  await armInteraction(page, [gmailApprovalStep]);
  await startMission(page, "send the quarterly report");
  await expect(page.getByText("send draft with Gmail?")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Dismiss" }).click();

  // Card gone instantly; the transcript reads the standard stop line.
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
  await expect(page.getByText("Stopped by user")).toBeVisible();

  // Reload + reopen the mission from the board: the card stays gone (persisted
  // interaction cleared), the stop marker persists.
  await page.reload();
  await page.getByText("send the quarterly report").first().click();
  await expect(page.getByText("Stopped by user")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
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
 * confirming the approval completes the sequence as ONE VISIBLE structured user
 * message that carries BOTH the typed answer and the HUMANIZED approved line (a
 * sequence with questions sends visibly, unlike a confirm-only one). The visible
 * bubble reads "Allowed Gmail to send draft." for a non-technical user; the raw
 * slug the model re-issues rides the hidden body, not this bubble.
 */
test("composes one visible message from a question then a confirmation", async ({
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

  // 2 of 2: the approval. Do it completes and composes the one message.
  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(page.getByText("send draft with Gmail?")).toBeVisible();
  await page.getByRole("button", { name: /Do it/ }).click();

  // Exactly ONE visible user message, carrying the answer AND the HUMANIZED
  // approved line (the raw slug lives only in the hidden model-facing body).
  const composed = page
    .locator(".is-user")
    .filter({ hasText: "john@acme.com" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Allowed Gmail to send draft.");
  await expect(composed).not.toContainText("GMAIL_SEND_DRAFT");
  await expect(page.getByText("send draft with Gmail?")).toHaveCount(0);
});

/**
 * (7, owner design tweak) The QUESTION card's "Skip" beside the free-text field
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

  const skip = page.getByRole("button", { name: /Skip/ });
  await expect(skip).toBeVisible();

  await skip.hover();

  // It is genuinely clickable: clicking skips the (lone) question.
  await skip.click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
});
