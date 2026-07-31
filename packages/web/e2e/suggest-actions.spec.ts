import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { closeActivityPanel } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";

/**
 * The clean-finish offers a mission keeps after its last turn: the "what to do
 * next" bubbles (`suggest_actions`) and the save-as-reusable card
 * (`suggest_reusable`). Both are OPTIONAL — they sit ABOVE the live composer
 * rather than replacing it — and both survive the mission's move to Done.
 *
 * The board contract they ride on: a clean finish settles the card in **Needs
 * you**, never Done. `done` is the USER's word — a checkmark, a drag, or a bulk
 * move — so the engine can no longer retire a mission on the user's behalf. The
 * offers are the reason it must not: they are the mission asking for one more
 * decision, and a card auto-filed under Done buries them.
 */

/** The board card for a mission, addressed by its title. */
const missionCard = (page: Page, title: string) =>
  page.locator("[data-kanban-card]").filter({ hasText: title });

/** The two clean-finish offers, armed together on the next turn's done frame. */
const BOTH_OFFERS = {
  interaction: {
    steps: [
      {
        kind: "suggest_actions",
        id: "a1",
        actions: [
          { id: "draft", label: "Draft an email", message: "Draft the email." },
          { id: "share", label: "Share update", message: "Share the update." },
        ],
      },
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly update",
        rationale: "You will want this same update again next week.",
      },
    ],
  },
};

test("suggested action pills settle the card in Needs you, prefill the composer, and dismiss", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "suggest_actions",
            id: "a1",
            actions: [
              {
                id: "draft",
                label: "Draft an email",
                message: "Draft the email.",
              },
              {
                id: "share",
                label: "Share update",
                message: "Share the update.",
              },
            ],
          },
        ],
      },
    },
  });
  await startMission(page, "prepare the update");
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  // A suggestions-only finish is still a clean finish, and a clean finish now
  // parks the card in Needs you: only the user files a mission under Done.
  await expect(
    page
      .locator('[data-kanban-column="needs_you"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-kanban-column="done"]').getByText("prepare the update"),
  ).toHaveCount(0);
  const followUp = page.getByPlaceholder("Send a follow-up...");
  await expect(followUp).toBeVisible();
  // HOU-1050: a pill click prefills the composer instead of sending, and the
  // pills stay up so the user can still pick a different one (each click
  // replaces the draft).
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Share update" }).click();
  await expect(followUp).toHaveValue("Share the update.");
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  // Confirming with Enter runs the normal composer send and retires the pills.
  await followUp.press("Enter");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share update", exact: true }),
  ).toHaveCount(0);
  // Wait for the prefilled send's turn to fully settle BEFORE staging the next
  // offer:
  // staging while that turn is still open races it onto the wrong done frame,
  // where the upcoming composer send would abandon it.
  await expect(
    page.getByText('Roger that. You said: "Draft the email."'),
  ).toBeVisible();

  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            ...{ kind: "suggest_actions", id: "a2" },
            actions: [
              { id: "one", label: "One", message: "One." },
              { id: "two", label: "Two", message: "Two." },
            ],
          },
        ],
      },
    },
  });
  await page.getByPlaceholder("Send a follow-up...").fill("again");
  await page.getByPlaceholder("Send a follow-up...").press("Enter");
  await expect(
    page.getByRole("button", { name: "Dismiss suggested actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss suggested actions" }).click();
  // exact: the board's "Move to done" button would otherwise substring-match.
  await expect(
    page.getByRole("button", { name: "One", exact: true }),
  ).toHaveCount(0);
});

/**
 * The user's own move to Done is what retires a finished mission — and it keeps
 * the offers. Moving to Done answers whatever the mission was BLOCKED on, so the
 * blocking steps go, but the optional clean-finish offers are not questions: the
 * Done card still lets the user pick a follow-up or save the work as a Skill.
 *
 * Asserted TWICE, and both halves matter. Live, the offers come from the
 * conversation VM, which a board write never touches — that path only agrees
 * with the persisted one because `deriveActiveInteraction` applies the same
 * strip. After a reload the VM is gone and what renders is purely the
 * interaction the move to Done rewrote on disk. Assert one and not the other
 * and half the contract can be deleted with the test still green.
 */
test("the user's move to Done keeps the finished mission's offers", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: BOTH_OFFERS,
  });
  await startMission(page, "prepare the update");

  // Both offers render together above the live composer.
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(page.getByText("Save this for next time")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
  await expect(
    page
      .locator('[data-kanban-column="needs_you"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();

  // The checkmark is the ONLY thing that files it under Done (card actions are
  // hover-gated, so close the chat panel to reach the board first).
  await closeActivityPanel(page);
  const card = missionCard(page, "prepare the update");
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();

  // LIVE: reopening the Done card still offers both — the move stripped only
  // what the mission was blocked on, and it was blocked on nothing.
  await card.click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Save this for next time")).toBeVisible();

  // AFTER A RELOAD: the conversation VM is gone, so this is the interaction the
  // move to Done actually persisted. Without the retain rule the Done card
  // would come back empty.
  await page.reload();
  await missionCard(page, "prepare the update").click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Save this for next time")).toBeVisible();
});

/**
 * The other half of the Done contract: a mission the user moves to Done while
 * it is BLOCKED must not keep asking. Moving to Done answers the question, so
 * the stepper is gone and the plain composer is back.
 *
 * What this pins is the PERSISTED strip (the `retainSuggestionSteps` rule on the
 * write seams). The live-VM half of the same rule — `deriveActiveInteraction`
 * refusing to render a blocking interaction on a Done mission — is pinned by
 * `app/tests/active-interaction.test.ts`; this harness cannot distinguish it,
 * because reopening the card here already reads the stripped persisted value.
 */
test("the user's move to Done retires a blocking question, live", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          { kind: "question", id: "q1", question: "Which deck should I send?" },
        ],
      },
    },
  });
  await startMission(page, "send the deck");
  // The stepper REPLACES the composer while the mission is blocked.
  await expect(page.getByPlaceholder("Type your answer...")).toBeVisible({
    timeout: 15_000,
  });

  await closeActivityPanel(page);
  const card = missionCard(page, "send the deck");
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("send the deck")
      .first(),
  ).toBeVisible();

  // Reopening it: the move to Done answered the question, so the composer
  // stands alone. No reload — this is exactly the case that used to keep the
  // stepper until the app was restarted.
  await card.click();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByPlaceholder("Type your answer...")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Collapse interaction" }),
  ).toHaveCount(0);
});

/**
 * Per-STEP dismissal: the two offers are independent, so dismissing the action
 * bubbles must drop ONLY their step from the persisted interaction. The
 * save-as-reusable card is still there after a full reload — the regression
 * where one dismiss wiped the whole pending interaction and took its sibling.
 */
test("dismissing one offer keeps its sibling, through a reload", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: BOTH_OFFERS,
  });
  await startMission(page, "prepare the update");

  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(page.getByText("Save this for next time")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss suggested actions" }).click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toHaveCount(0);
  await expect(page.getByText("Save this for next time")).toBeVisible();

  // Reload: local dismissal state is gone, so what renders now comes purely
  // from the persisted interaction the dismiss rewrote.
  await page.reload();
  await missionCard(page, "prepare the update").click();
  await expect(page.getByText("Save this for next time")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toHaveCount(0);
});
