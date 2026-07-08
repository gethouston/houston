import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU-725: the routine chat is always beside the routine. "New routine"
 * opens the empty form AND the guided setup chat together (no chooser), the
 * agent speaks first (the Houston-sent kickoff bubble never renders), and
 * the chat never appears as a board card. The chat is permanent: the created
 * routine claims it via `setup_activity_id`, so reopening the routine
 * resumes the very same conversation instead of cleaning it up.
 */

async function openRoutinesTab(page: import("@playwright/test").Page) {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

async function startNewRoutine(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New routine" }).first().click();
}

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

test("new routine: the empty form and the setup chat open together, agent speaks first", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutine(page);

  // No chooser: the editor (empty form) is already on screen…
  await expect(page.getByPlaceholder("e.g. Morning standup")).toBeVisible();
  // …with the setup-chat panel beside it.
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible({
    timeout: 10_000,
  });

  // The agent's reply is the FIRST visible message — the user typed nothing.
  // (The fake host's canned reply echoes the kickoff prompt, so "no kickoff
  // bubble" can't be asserted by text here — the unit test on
  // filterAutoContinueFeedItems covers it.)
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: test.info().outputPath("setup-chat-open.png"),
  });
});

test("mid-interview: no board card, tab switch leaves a Continue banner on the grid", async ({
  page,
}) => {
  // Settle-dependent (the interaction rides the DONE frame): triple budget
  // for a CI drop + resync cycle.
  test.slow();
  // Arm the turn to settle on an ask_user interaction — mid-interview state.
  await fetch(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "What should the routine do?",
            options: [
              { id: "email", label: "Check my email" },
              { id: "brief", label: "Morning brief" },
            ],
          },
        ],
      },
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutine(page);
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // The ask_user question card REPLACES the composer once the turn settles —
  // this is the interview's whole interaction surface, so the setup panel
  // must forward composerOverride like the board panel does. Settle-dependent,
  // so generous for a CI drop + resync cycle.
  await expect(page.getByText("What should the routine do?")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  // No VISIBLE card on the Activity board (the setup surface's own hidden
  // list still holds the item, so assert visibility, not count).
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(
    page.getByText("Set up a new routine", { exact: true }),
  ).not.toBeVisible();

  // Back on Routines the editor is still open — leave it for the grid; the
  // tab round-trip closes the shared panel, so the unfinished draft chat
  // surfaces as the Continue/Discard banner on the grid.
  await page.locator('[data-tour-target="tab-routines"]').click();
  await page.getByRole("button", { name: "Back to routines" }).click();
  await page.locator('[data-tour-target="tab-activity"]').click();
  await openRoutinesTab(page);
  await expect(
    page.getByText("You are creating a routine in chat"),
  ).toBeVisible();

  // Continue reopens the same chat (no duplicate mission created), together
  // with the creation form.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible();
  await expect(page.getByPlaceholder("e.g. Morning standup")).toBeVisible();
});

test("the chat is claimed by the created routine and resumes on reopen", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutine(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // Create the routine with the form while the chat is open: the routine
  // must claim the draft chat (setup_activity_id) instead of orphaning it.
  await page.getByPlaceholder("e.g. Morning standup").fill("Morning brief");
  await page
    .getByPlaceholder("What should the agent do when this runs?")
    .fill("Summarize my inbox.");
  await page
    .getByRole("button", { name: "Create routine", exact: true })
    .click();

  // The editor switches to edit mode on the created routine (the Run now
  // affordance only exists for a persisted routine).
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible({
    timeout: 10_000,
  });

  // The routine on the fake host carries the chat's id.
  const agentId = await seedAgentId();
  const { items: routines } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { id: string; setup_activity_id?: string }[] };
  expect(routines).toHaveLength(1);
  expect(routines[0].setup_activity_id).toBeTruthy();

  // Fresh visit (the real user journey: come back later): the grid shows the
  // routine and NO draft banner — the chat belongs to the routine now.
  await page.reload();
  await openRoutinesTab(page);
  await expect(page.getByText("Morning brief")).toBeVisible();
  await expect(
    page.getByText("You are creating a routine in chat"),
  ).toHaveCount(0);

  // Opening the routine resumes the SAME chat beside the form: same mission
  // title, and the earlier conversation is still there.
  await page.getByText("Morning brief").first().click();
  await expect(page.getByText("Mission: Set up a new routine")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });
});

test("a routine without a chat gets one on first open, linked from then on", async ({
  page,
}) => {
  // A form-era routine: created straight through REST, no setup chat.
  const agentId = await seedAgentId();
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Legacy digest",
      prompt: "Digest my day.",
      schedule: "0 18 * * *",
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  await page.getByText("Legacy digest").first().click();

  // A chat starts beside the form (titled after the routine), agent first.
  await expect(page.getByText("Mission: Legacy digest")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // And the routine now carries the link, so the chat is permanent.
  await expect
    .poll(async () => {
      const { items } = (await (
        await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
      ).json()) as { items: { name: string; setup_activity_id?: string }[] };
      return items.find((r) => r.name === "Legacy digest")?.setup_activity_id;
    })
    .toBeTruthy();
});
