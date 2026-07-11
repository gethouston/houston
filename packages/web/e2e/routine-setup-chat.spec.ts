import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * HOU first-principles rebuild: a routine's chat is the ENTIRE Routines tab
 * content while it's open (no side-by-side editor, no run history list).
 * "New routine" is a split trigger — With AI opens the guided chat (agent
 * speaks first, asks what/when, creates it), Manually drops a blank routine
 * into the list already expanded for inline editing. Rows aren't clickable;
 * "Edit with AI" in a row's menu is what opens an existing routine's chat.
 * The chat never appears as a board card, and it's permanent: the routine
 * claims it via `setup_activity_id`, so reopening the routine resumes the
 * very same conversation instead of cleaning it up. A person can have
 * several routines in construction at once — each is its own resumable row.
 */

async function openRoutinesTab(page: import("@playwright/test").Page) {
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
}

async function startNewRoutineWithAi(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "New routine" }).first().click();
  await page.getByRole("menuitem", { name: "With AI" }).click();
}

/** Rows aren't clickable — "Edit with AI" in the row's menu opens its chat. */
async function editRoutineWithAi(
  page: import("@playwright/test").Page,
  routineName: string,
) {
  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: routineName });
  await row.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Edit with AI" }).click();
}

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

test("new routine with AI: opens straight into the chat, agent speaks first", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutineWithAi(page);

  // No form, no grid behind it — the chat is the whole screen.
  await expect(
    page.getByRole("button", { name: "Back to routines" }),
  ).toBeVisible();
  await expect(page.getByText("New routine", { exact: true })).toBeVisible({
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

async function listRoutines(agentId: string): Promise<{ name: string }[]> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { name: string }[] };
  return items;
}

test("new routine manually: local editor, nothing written until Create routine", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await page.goto("/");
  await openRoutinesTab(page);
  await page.getByRole("button", { name: "New routine" }).first().click();
  await page.getByRole("menuitem", { name: "Manually" }).click();

  // No screen change: still on the grid, with a LOCAL inline editor as the
  // list's first card (name/schedule/instruction) — the "Manually" surface.
  await expect(page.getByPlaceholder("e.g. Morning standup")).toBeVisible();
  await expect(
    page.getByPlaceholder("What should the agent do when this runs?"),
  ).toBeVisible();
  // …and NOTHING is on disk yet: the editor is purely local until Create.
  expect(await listRoutines(agentId)).toHaveLength(0);

  await page.getByPlaceholder("e.g. Morning standup").fill("Weekly cleanup");
  await page
    .getByPlaceholder("What should the agent do when this runs?")
    .fill("Tidy up the shared drive.");
  // The save button is "Create routine" for a brand-new routine.
  await page.getByRole("button", { name: "Create routine" }).click();

  // Now it's a real routine — in the list AND on disk.
  await expect(page.getByText("Weekly cleanup")).toBeVisible();
  await expect
    .poll(async () => (await listRoutines(agentId)).map((r) => r.name))
    .toContain("Weekly cleanup");
});

test("new routine manually: Cancel discards with zero disk writes", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await page.goto("/");
  await openRoutinesTab(page);
  await page.getByRole("button", { name: "New routine" }).first().click();
  await page.getByRole("menuitem", { name: "Manually" }).click();

  const nameField = page.getByPlaceholder("e.g. Morning standup");
  await expect(nameField).toBeVisible();
  await nameField.fill("Abandoned");

  // Cancel throws the local editor away without ever touching disk.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(nameField).toHaveCount(0);
  expect(await listRoutines(agentId)).toHaveLength(0);
});

test("mid-interview: no board card, tab switch leaves the draft resumable in the grid", async ({
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
  await startNewRoutineWithAi(page);
  await expect(page.getByText("New routine", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // The ask_user question card shows ABOVE the composer once the turn settles
  // — this is the interview's whole interaction surface, so the setup panel
  // must forward composerOverride like the board panel does. The real composer
  // stays mounted and visible alongside it. Settle-dependent, so generous for a
  // CI drop + resync cycle.
  await expect(page.getByText("What should the routine do?")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();

  // No VISIBLE card on the Activity board (the setup surface's own hidden
  // list still holds the item, so assert visibility, not count).
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(
    page.getByText("Set up a new routine", { exact: true }),
  ).not.toBeVisible();

  // Back on Routines the chat is still open — leave it for the grid; the
  // unfinished draft surfaces as its own resumable row there.
  await page.locator('[data-tour-target="tab-routines"]').click();
  await page.getByRole("button", { name: "Back to routines" }).click();
  await page.locator('[data-tour-target="tab-activity"]').click();
  await openRoutinesTab(page);
  await expect(page.getByText("Routine being created in chat")).toBeVisible();

  // Resume reopens the same chat (no duplicate mission created).
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("New routine", { exact: true })).toBeVisible();
});

test("a routine created via chat claims the draft and resumes on reopen", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutineWithAi(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // Find the draft chat's activity id — what the agent's tool call reads to
  // stamp `setup_activity_id` when it creates the routine (routineSetupPrompt
  // instructs it to; there is no more form to create one manually).
  const agentId = await seedAgentId();
  const { items: activities } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/activities`)
  ).json()) as { items: { id: string; agent?: string; routine_id?: string }[] };
  const draft = activities.find(
    (a) => a.agent === "houston:routine-setup" && !a.routine_id,
  );
  expect(draft).toBeTruthy();

  // Simulate the agent creating the routine and claiming the draft chat.
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Morning brief",
      prompt: "Summarize my inbox.",
      schedule: "0 9 * * *",
      setup_activity_id: draft?.id,
    }),
  });

  // Fresh visit (the real user journey: come back later): the grid shows the
  // routine and NO draft row — the chat belongs to the routine now.
  await page.reload();
  await openRoutinesTab(page);
  await expect(page.getByText("Morning brief")).toBeVisible();
  await expect(page.getByText("Routine being created in chat")).toHaveCount(0);

  // Opening the routine (Edit with AI) resumes the SAME chat: the header now
  // reads the routine's own name, and the earlier conversation is still there.
  await editRoutineWithAi(page, "Morning brief");
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/Roger that\./).first()).toBeVisible({
    timeout: 15_000,
  });

  // …and it can be CONTINUED: a follow-up goes to the same session and the
  // agent answers in the same thread (a second canned reply appears).
  await page.getByPlaceholder("Send a follow-up...").fill("Make it weekly");
  await page.keyboard.press("Enter");
  // The canned reply echoes the message back — same session, same thread.
  await expect(
    page.getByText('Roger that. You said: "Make it weekly"'),
  ).toBeVisible({ timeout: 15_000 });
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
  await editRoutineWithAi(page, "Legacy digest");

  // A chat starts (titled after the routine), agent first.
  await expect(page.getByText("Routine: Legacy digest")).toBeVisible({
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

test("clicking app chrome never dismisses the routine chat", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Sticky chat",
      prompt: "p",
      schedule: "0 9 * * *",
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  await editRoutineWithAi(page, "Sticky chat");
  await expect(page.getByText("Routine: Sticky chat")).toBeVisible({
    timeout: 15_000,
  });

  // The chat is the entire tab content, not a dismissible overlay:
  // pointerdowns on app chrome (sidebar, titlebar — e.g. the double-click
  // that maximizes the window) must leave it open.
  await page.locator('[data-tour-target="tab-routines"]').click();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.getByText("Routine: Sticky chat")).toBeVisible();
});

test("an agent edit that drops the routine's chat link self-heals", async ({
  page,
}) => {
  // Build a linked routine+chat through the modify flow.
  const agentId = await seedAgentId();
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Healed digest",
      prompt: "p",
      schedule: "0 9 * * *",
    }),
  });
  await page.goto("/");
  await openRoutinesTab(page);
  await editRoutineWithAi(page, "Healed digest");
  await expect(page.getByText("Routine: Healed digest")).toBeVisible({
    timeout: 15_000,
  });

  const routineByName = async () => {
    const { items } = (await (
      await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
    ).json()) as {
      items: { id: string; name: string; setup_activity_id?: string | null }[];
    };
    const r = items.find((x) => x.name === "Healed digest");
    if (!r) throw new Error("routine gone");
    return r;
  };
  const linked = await expect
    .poll(async () => (await routineByName()).setup_activity_id)
    .toBeTruthy()
    .then(routineByName);

  // Simulate the reported bug: the agent rewrites the routine (e.g. an
  // effort change) and drops setup_activity_id from routines.json.
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines/${linked.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ setup_activity_id: null }),
  });

  // The open chat survives the drop (the activity's routine_id stamp is the
  // durable direction)…
  await expect(page.getByText("Routine: Healed digest")).toBeVisible();
  // …and the client restores the forward link on disk.
  await expect
    .poll(async () => (await routineByName()).setup_activity_id)
    .toBe(linked.setup_activity_id);

  // A fresh visit resumes the SAME chat — no duplicate mission spawned.
  await page.reload();
  await openRoutinesTab(page);
  await editRoutineWithAi(page, "Healed digest");
  await expect(page.getByText("Routine: Healed digest")).toBeVisible({
    timeout: 15_000,
  });
  const { items: activities } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/activities`)
  ).json()) as { items: { title: string }[] };
  expect(activities.filter((a) => a.title === "Healed digest")).toHaveLength(1);
});

test("the draft chat transitions in place the moment a routine claims it", async ({
  page,
}) => {
  await page.goto("/");
  await openRoutinesTab(page);
  await startNewRoutineWithAi(page);
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // Until a routine claims it, the open draft chat's header reads "New routine".
  await expect(page.getByText("New routine", { exact: true })).toBeVisible();

  // Find the still-unclaimed draft (agent === routine-setup, no routine_id).
  const agentId = await seedAgentId();
  const { items: activities } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/activities`)
  ).json()) as { items: { id: string; agent?: string; routine_id?: string }[] };
  const draft = activities.find(
    (a) => a.agent === "houston:routine-setup" && !a.routine_id,
  );
  expect(draft).toBeTruthy();

  // Simulate the agent creating the routine mid-chat and claiming this draft.
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Morning brief",
      prompt: "Summarize my inbox.",
      schedule: "0 9 * * *",
      setup_activity_id: draft?.id,
    }),
  });

  // The SAME open chat transitions in place — no reload, no user navigation —
  // and its header swaps to the routine's own name.
  await expect(page.getByText("Routine: Morning brief")).toBeVisible({
    timeout: 15_000,
  });
});

test("the row menu offers Run now and closes after firing", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Runnable",
      prompt: "Do the thing.",
      schedule: "0 9 * * *",
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  const row = page
    .locator('[data-testid="routine-row"]')
    .filter({ hasText: "Runnable" });
  await row.getByRole("button", { name: "More actions" }).click();

  const runNow = page.getByRole("menuitem", { name: "Run now" });
  await expect(runNow).toBeVisible();
  await runNow.click();

  // The fake host accepts run-now as a no-op: the menu just closes, no crash,
  // and the routine is still in the list.
  await expect(runNow).toHaveCount(0);
  await expect(page.getByText("Runnable")).toBeVisible();
});

test("Escape returns from a routine chat to the grid", async ({ page }) => {
  const agentId = await seedAgentId();
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Escapable",
      prompt: "p",
      schedule: "0 9 * * *",
    }),
  });

  await page.goto("/");
  await openRoutinesTab(page);
  await editRoutineWithAi(page, "Escapable");
  await expect(page.getByText("Routine: Escapable")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Roger that\./)).toBeVisible({
    timeout: 15_000,
  });

  // Escape backs out of the chat to the grid. A FOCUSED composer absorbs
  // Escape rather than backing out (it blurs once the turn is idle, or stops an
  // in-flight turn while one is running) — so it never leaves the chat on its
  // own. From a BLURRED composer, Escape reaches the tab's document handler and
  // returns to the grid.
  //
  // The back-out is driven from an explicitly blurred composer instead of a
  // second keypress on purpose: a routine chat's kickoff turn can still be
  // settling client-side, and while the composer believes a turn is running it
  // routes Escape to "stop the turn" (preventDefault) instead of blur — a
  // turn-settle race unrelated to the back-out. Blurring first makes the single
  // Escape that navigates deterministic. The composer's autofocus is one-shot
  // (fires once on open, not on every re-render), so nothing re-grabs focus
  // after the blur.
  const composer = page.getByPlaceholder("Send a follow-up...");
  await composer.click();
  await expect(composer).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Routine: Escapable")).toBeVisible();
  await composer.blur();
  await expect(composer).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Routine: Escapable")).toBeHidden();

  // The chat still opens fine afterwards (Escape never wedged the view).
  await editRoutineWithAi(page, "Escapable");
  await expect(page.getByText("Routine: Escapable")).toBeVisible({
    timeout: 15_000,
  });
});
