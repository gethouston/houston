import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The team view's ROUTINES and FILES sections, driven from the rail that opens
 * them. What this spec guards:
 *
 *   - Routines is ONE list across the team's agents, and every row says whose
 *     routine it is — the merge is only honest if the owner is visible;
 *   - a row action lands on the OWNING agent's route, not on whichever agent
 *     the section happened to read first (two agents' routines can share an id,
 *     which is why rows are keyed `agentId::routineId`);
 *   - the agent dropdown narrows the list, and is the same pin the rail writes;
 *   - Files never merges trees: it shows ONE agent's real tree and the dropdown
 *     switches which, so an agent with no files says so instead of showing
 *     another agent's;
 *   - a routine still being BUILT in chat is a row here too, resumable and
 *     discardable, or one started from this surface would vanish from it;
 *   - an agent whose reads fail is NAMED, not silently dropped from the list —
 *     including the agent whose routines arrived but whose run history did not
 *     — and when NOTHING answered the list stops claiming the team is idle.
 */

function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

/** The content column, so lookups never catch the rail's same-named rows. */
function screen(page: Page): Locator {
  // The screen ON THE GLASS: several kept-alive screens sit in the DOM at
  // once, so a page-level lookup would match the hidden ones too.
  return page.locator("[data-screen-active='true']");
}

function sectionRows(page: Page, label: string): Locator {
  return rail(page)
    .locator("[data-sidebar-section-row]")
    .filter({ hasText: label });
}

function routineRows(page: Page): Locator {
  return screen(page).getByTestId("routine-row");
}

/** The "we could not read these agents" strip, by testid: `role="status"` alone
 *  also catches the browser's own sr-only live regions. */
function failedStrip(page: Page): Locator {
  return screen(page).getByTestId("agent-reads-failed");
}

/** Draft rows (a routine still being built in chat) sit above the created ones. */
function draftRows(page: Page): Locator {
  return screen(page).getByRole("option", {
    name: "Routine being created in chat",
  });
}

/** A second agent, so the team's list has two owners to merge and tell apart. */
async function addKai(request: APIRequestContext): Promise<string> {
  const created = await request.post(`${FAKE_HOST_URL}/agents`, {
    data: { name: "Kai" },
  });
  return ((await created.json()) as { id: string }).id;
}

async function seedRoutine(
  request: APIRequestContext,
  agentId: string,
  name: string,
): Promise<string> {
  const created = await request.post(
    `${FAKE_HOST_URL}/agents/${agentId}/routines`,
    { data: { name, prompt: "p", schedule: "0 9 * * *" } },
  );
  return ((await created.json()) as { id: string }).id;
}

/** Rewind the fake host's global routine-id counter, so the next routine it
 *  mints reuses an id another agent already holds (see its README). */
async function rewindRoutineIds(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/routine-seq`, {
    data: { next: 0 },
  });
}

async function routineEnabled(
  agentId: string,
  name: string,
): Promise<boolean | undefined> {
  const { items } = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`)
  ).json()) as { items: { name: string; enabled: boolean }[] };
  return items.find((r) => r.name === name)?.enabled;
}

async function openSection(page: Page, label: string): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();
  await sectionRows(page, label).first().click();
}

test("Routines merges the team's agents into one list, each row naming its owner", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await seedRoutine(request, SEED_AGENT_ID, "Morning digest");
  await seedRoutine(request, kai, "Payroll run");

  await openSection(page, "Routines");

  // One list, both agents' routines in it.
  await expect(routineRows(page)).toHaveCount(2);
  await expect(screen(page).getByText("Morning digest")).toBeVisible();
  await expect(screen(page).getByText("Payroll run")).toBeVisible();

  // And each row says WHOSE it is — without that, a merged list is a lie.
  await expect(
    routineRows(page).filter({ hasText: "Morning digest" }),
  ).toContainText("Houston");
  await expect(
    routineRows(page).filter({ hasText: "Payroll run" }),
  ).toContainText("Kai");
});

test("a row's toggle writes to the agent that owns that routine", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  // Deliberately the SAME routine name AND the same routine id on both agents.
  // Ids are unique per agent, never per workspace, so this is ordinary
  // production truth — and a list keyed on the bare routine id would route this
  // toggle to whichever agent answered first. The fake host's counter is global,
  // so the collision has to be armed rather than assumed.
  const houstonRoutine = await seedRoutine(
    request,
    SEED_AGENT_ID,
    "Daily digest",
  );
  await rewindRoutineIds(request);
  const kaiRoutine = await seedRoutine(request, kai, "Daily digest");
  expect(kaiRoutine).toBe(houstonRoutine);

  // Every PATCH the page sends, so the assertion is about the ROUTE taken and
  // not only about the state left behind.
  const writes: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/routines/"))
      writes.push(req.url());
  });

  await openSection(page, "Routines");
  await expect(routineRows(page)).toHaveCount(2);

  // Flip the row that belongs to Kai (identified by its owner chip).
  const kaiRow = routineRows(page).filter({ hasText: "Kai" });
  await kaiRow.getByRole("switch").click();

  // Kai's routine is off; Houston's identically-named, identically-ided one is
  // untouched.
  await expect.poll(() => routineEnabled(kai, "Daily digest")).toBe(false);
  expect(await routineEnabled(SEED_AGENT_ID, "Daily digest")).toBe(true);

  // And the write went to KAI's route. With one shared id, the state check
  // alone could pass off a lucky ordering as correct routing.
  expect(writes).toHaveLength(1);
  expect(writes[0]).toContain(`/agents/${kai}/routines/${kaiRoutine}`);
  expect(writes[0]).not.toContain(`/agents/${SEED_AGENT_ID}/`);
});

test("the Routines dropdown narrows the list to one agent, and drops the owner chips", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await seedRoutine(request, SEED_AGENT_ID, "Morning digest");
  await seedRoutine(request, kai, "Payroll run");

  await openSection(page, "Routines");
  await expect(routineRows(page)).toHaveCount(2);

  await screen(page).getByRole("button", { name: "All agents" }).click();
  await page.getByRole("menuitem", { name: "Kai" }).click();

  // One owner in view, so the chip that names the owner stops earning its
  // place: the dropdown already says whose list this is.
  await expect(routineRows(page)).toHaveCount(1);
  await expect(screen(page).getByText("Payroll run")).toBeVisible();
  await expect(screen(page).getByText("Morning digest")).toHaveCount(0);
  await expect(routineRows(page).first()).not.toContainText("Kai");

  // The pin is the rail's: the agent row the section narrowed to is lit.
  await expect(
    rail(page)
      .locator("[data-sidebar-item]")
      .filter({ hasText: "Kai" })
      .locator("[aria-current='page']"),
  ).toHaveCount(1);
});

test("an agent whose routines fail is named, not silently dropped", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await seedRoutine(request, SEED_AGENT_ID, "Morning digest");
  await seedRoutine(request, kai, "Payroll run");
  // Kai's pod is unreachable; the rest of the fleet answers.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [kai] },
  });

  await openSection(page, "Routines");

  // What answered still renders; what did not is stated by name, with a retry
  // scoped to it. Dropping Kai would show one routine as the team's routines.
  await expect(screen(page).getByText("Morning digest")).toBeVisible();
  const strip = failedStrip(page);
  await expect(strip).toContainText("Couldn't load 1 of 2 agents");
  await expect(strip).toContainText("Kai");

  // Retry once the pod is back: only the failed agent is refetched, and its
  // routines join the list.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [] },
  });
  await strip.getByRole("button", { name: "Try again" }).click();
  await expect(screen(page).getByText("Payroll run")).toBeVisible();
  await expect(failedStrip(page)).toHaveCount(0);
});

test("a routine whose RUNS read failed still names its agent, and retries", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await seedRoutine(request, SEED_AGENT_ID, "Morning digest");
  await seedRoutine(request, kai, "Payroll run");
  // Kai answers about its routines but not about their run history: every one
  // of its rows loses its last-run line and its stop-the-run action. A row that
  // degraded is not a whole row, so the agent has to be named.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [kai], segments: ["routine_runs"] },
  });

  await openSection(page, "Routines");

  // Both agents' routines still render — nothing was dropped — and the strip
  // says which agent this list cannot tell the whole truth about.
  await expect(routineRows(page)).toHaveCount(2);
  const strip = failedStrip(page);
  await expect(strip).toContainText("Couldn't load 1 of 2 agents");
  await expect(strip).toContainText("Kai");

  // Retry reaches the read that failed, not only the one that worked.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [] },
  });
  await strip.getByRole("button", { name: "Try again" }).click();
  await expect(failedStrip(page)).toHaveCount(0);
});

test("with every agent unreadable the list never claims the team is idle", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [SEED_AGENT_ID, kai] },
  });

  await openSection(page, "Routines");

  // Nothing answered, so an empty list is not evidence of an empty team.
  const strip = failedStrip(page);
  await expect(strip).toContainText("Couldn't load 2 of 2 agents");
  await expect(
    screen(page).getByText("Couldn't load this team's routines"),
  ).toBeVisible();
  await expect(
    screen(page).getByText("Nothing runs on its own yet"),
  ).toHaveCount(0);

  // Once the fleet is back, the same list says the honest thing instead.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [] },
  });
  await strip.getByRole("button", { name: "Try again" }).click();
  await expect(
    screen(page).getByText("Nothing runs on its own yet"),
  ).toBeVisible();
});

test("a routine half-built from the team surface is a row in the team's list", async ({
  page,
  request,
}) => {
  // A second agent, so "New routine" has to ASK whose routine this is.
  await addKai(request);

  await openSection(page, "Routines");
  // A team with nothing scheduled yet: the empty state owns the create button.
  await expect(
    screen(page).getByText("Nothing runs on its own yet"),
  ).toBeVisible();

  // "New routine" on a two-agent team asks whose routine this is, then opens
  // the intake in the shared shell panel.
  await screen(page).getByRole("button", { name: "New routine" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Kai", exact: true })
    .click();
  await expect(page.getByText("How do you want to start?")).toBeVisible();

  // Complete the intake: it hands off to a real setup chat, which is a DRAFT —
  // no routine exists yet.
  await page.getByRole("radio", { name: "From scratch" }).click();
  await page.getByRole("radio", { name: "Every weekday morning" }).click();
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });

  // The draft is a row in the TEAM's list, wearing its owner, selected while
  // its chat is open. Without it the grid would still say nothing runs on its
  // own while that very chat filled the panel beside it.
  const draft = draftRows(page);
  await expect(draft).toHaveCount(1);
  await expect(draft).toContainText("Kai");
  await expect(draft).toHaveAttribute("aria-selected", "true");
  await expect(
    screen(page).getByText("Nothing runs on its own yet"),
  ).toHaveCount(0);

  // The header takes the create button back the moment the grid has a row.
  await expect(
    screen(page).getByRole("button", { name: "New routine" }),
  ).toBeVisible();

  // Close the chat and the row is still there — that is the whole point.
  await page
    .getByTestId("mission-panel")
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  await expect(draft).toHaveCount(1);
  await expect(draft).toHaveAttribute("aria-selected", "false");

  // Resume: the same conversation reopens in the panel, on Kai.
  await draft.click();
  await expect(page.getByText(/Roger that\./)).toBeVisible({ timeout: 15_000 });
  await expect(draft).toHaveAttribute("aria-selected", "true");

  // Discard: the row goes, and the list is honestly empty again.
  await draft.getByRole("button", { name: "Discard" }).click();
  await expect(draftRows(page)).toHaveCount(0);
  await expect(
    screen(page).getByText("Nothing runs on its own yet"),
  ).toBeVisible();
});

test("Files shows ONE agent's real tree, and the dropdown switches which", async ({
  page,
  request,
}) => {
  await addKai(request);
  await openSection(page, "Files");

  // The seeded agent's actual files, under its own name as the root.
  await expect(screen(page).getByText("Q3 report.pdf")).toBeVisible();
  await expect(
    screen(page).getByRole("button", { name: "Houston", exact: true }),
  ).toBeVisible();

  // Kai keeps no files, and says so — rather than inheriting Houston's tree,
  // which is exactly what a merged filesystem would have shown.
  await screen(page)
    .getByRole("button", { name: "Houston", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Kai" }).click();
  await expect(screen(page).getByText("No files yet")).toBeVisible();
  await expect(screen(page).getByText("Q3 report.pdf")).toHaveCount(0);

  // Back again: the tree is per agent, not a one-way switch.
  await screen(page).getByRole("button", { name: "Kai", exact: true }).click();
  await page.getByRole("menuitem", { name: "Houston" }).click();
  await expect(screen(page).getByText("Q3 report.pdf")).toBeVisible();
});

test("Files opens on the agent the rail pinned, and its actions still work", async ({
  page,
  request,
}) => {
  const kai = await addKai(request);
  await request.post(`${FAKE_HOST_URL}/agents/${kai}/files/import`, {
    data: {
      files: [
        {
          name: "brief.md",
          contentBase64: Buffer.from("# brief").toString("base64"),
        },
      ],
    },
  });
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  // Arriving via an agent row pins that agent; the Files section reads the same
  // pin, so it opens on Kai rather than on the team's first agent — and the pin
  // survives the section row click, which is the whole point of carrying it.
  await rail(page).getByText("Kai", { exact: true }).click();
  await sectionRows(page, "Files").first().click();
  await expect(
    screen(page).getByRole("button", { name: "Kai", exact: true }),
  ).toBeVisible();
  await expect(screen(page).getByText("brief.md")).toBeVisible();
  await expect(screen(page).getByText("Q3 report.pdf")).toHaveCount(0);

  // The section IS the per-agent tab's wiring, so a write works here exactly as
  // it does there, and it lands on Kai rather than on the team's first agent.
  await screen(page).getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("menuitem", { name: "New folder" }).click();
  const name = page.getByPlaceholder("untitled folder");
  await expect(name).toBeVisible();
  await name.fill("Reports");
  await name.press("Enter");
  await expect(
    screen(page).getByText("Reports", { exact: true }),
  ).toBeVisible();

  const files = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${kai}/files`)
  ).json()) as { path: string }[];
  expect(files.some((f) => f.path === "Reports")).toBe(true);
});

test("a failed Files read names the agent instead of showing an empty tree", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [SEED_AGENT_ID] },
  });
  await openSection(page, "Files");

  // "No files yet" and "we could not read this agent" look identical on screen
  // unless the section says which one it is.
  const strip = failedStrip(page);
  await expect(strip).toContainText("Couldn't load Houston");
  await expect(strip.getByRole("button", { name: "Try again" })).toBeVisible();
});
