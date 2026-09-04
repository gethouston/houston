import {
  FAKE_HOST_URL,
  SEED_AGENT_ID,
  SEED_AGENT_NAME,
} from "@houston/fake-host";
import {
  COPY_SOURCE,
  createDialog,
  lastCopySelection,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "./support/copy-agent";
import { expect, test } from "./support/fixtures";
import { litRows, rail, screen } from "./support/team-nav";

/**
 * "Copy an agent": the create dialog's third door. Pick one of your agents,
 * then decide, item by item, what the new agent keeps: job description and
 * learnings, routines, skills, everything ON to start, and the chats, OFF to
 * start. The copy is the portable pipeline (preview, package, install) fed
 * that selection, so the fake host records what the package carried and the
 * spec asserts it; the chats ride the agent-scoped migration routes afterwards
 * and land on the copy's board.
 */
test("copies an agent, leaving chosen items behind and bringing the chats", async ({
  page,
  request,
}) => {
  const { routineId } = await seedCopySource(request);
  await page.goto("/");

  await page.getByRole("button", { name: "New agent" }).click();
  await openCopyWizard(page);

  // The seeded agent is the one source; picking it reads its content and
  // moves on to the first content screen by itself.
  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();

  // Job description and both learnings, all on. Leave one learning behind.
  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await expect(dialog.getByText(COPY_SOURCE.instructions)).toBeVisible();
  for (const text of COPY_SOURCE.learnings) {
    await expect(rowSwitch(page, text)).toBeChecked();
  }
  await rowSwitch(page, COPY_SOURCE.learnings[1]).click();
  await expect(rowSwitch(page, COPY_SOURCE.learnings[1])).not.toBeChecked();
  // Chats start OFF; bring them this time.
  const chats = rowSwitch(page, "Conversations");
  await expect(chats).not.toBeChecked();
  await chats.click();
  await expect(chats).toBeChecked();
  await next(page);

  // Routines, then skills. Keep the routine, drop the skill with "Clear".
  await expect(
    dialog.getByRole("heading", { name: "Which routines should come along?" }),
  ).toBeVisible();
  await expect(rowSwitch(page, COPY_SOURCE.routine.name)).toBeChecked();
  await next(page);
  await expect(
    dialog.getByRole("heading", { name: "Which skills should come along?" }),
  ).toBeVisible();
  await expect(rowSwitch(page, "Invoice Triage")).toBeChecked();
  await dialog.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(rowSwitch(page, "Invoice Triage")).not.toBeChecked();
  await next(page);

  // The naming screen is the create dialog's own, pre-filled with the first
  // free "<name> copy" and headed by the source.
  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  const nameField = dialog.getByPlaceholder(
    "e.g. Product manager, Sales, Jerry",
  );
  await expect(nameField).toHaveValue("Houston copy");
  await dialog.getByRole("button", { name: "Create Agent" }).click();

  // The copy lands in the rail and the dialog is gone.
  await expect(
    rail(page).getByText("Houston copy", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();

  // What the package carried is exactly what stayed switched on.
  expect(await lastCopySelection(request)).toEqual({
    includeClaudeMd: true,
    skillSlugs: [],
    routineIds: [routineId],
    learningIds: ["learn-1"],
  });

  // The chats followed in the background: the source's tasks are on the
  // copy's board (the landing screen), and the toast says so.
  await expect(page.getByText("Chats copied")).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(screen(page).getByText("Draft the launch email")).toBeVisible();
});

/**
 * A source with no routines or skills skips those screens; the "know" screen
 * always shows since the chats choice exists for every source. Left OFF, the
 * copy's board starts empty. Back from the source list returns to the
 * dialog's chooser.
 */
test("a bare source skips the list screens; chats stay behind by default", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New agent" }).click();
  await openCopyWizard(page);

  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Create new", exact: true }),
  ).toBeVisible();

  await openCopyWizard(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  // The seed's Memory tab has learnings, so the first content screen shows;
  // no job description, no routines, no skills.
  await expect(
    dialog.getByRole("heading", { name: "What should the copy know?" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Houston has no job description yet."),
  ).toBeVisible();
  await expect(rowSwitch(page, "Conversations")).not.toBeChecked();
  await next(page);
  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  await dialog.getByRole("button", { name: "Create Agent" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    rail(page).getByText("Houston copy", { exact: true }),
  ).toBeVisible();
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toHaveCount(0);
});

/**
 * On a server-backed host the copy is filed in a team by a gateway write, and
 * the roster only knows it after the round trip. Landing must wait for that:
 * navigating before it resolved the copy to the DEFAULT team, so the rail
 * lit "New Team" and its board showed the source's tasks instead of the copy.
 */
test("a copy started from a server team's New agent row lands on that team, focused on the copy", async ({
  page,
}) => {
  const OPS_TEAM = "team-ops";
  const base = FAKE_HOST_URL;
  await page.request.post(`${base}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, agentTeams: true, role: "owner" },
  });
  await page.request.post(`${base}/__test__/org`, {
    data: { agents: [{ id: SEED_AGENT_ID, name: SEED_AGENT_NAME }] },
  });
  await page.request.post(`${base}/__test__/agent-teams`, {
    data: {
      teams: [
        { id: "team-acme", name: "Acme", isDefault: true, sortOrder: 0 },
        {
          id: OPS_TEAM,
          name: "Operations",
          sortOrder: 1,
          members: [{ userId: "u-self", owner: true }],
        },
      ],
    },
  });
  await page.goto("/");
  await expect(page.getByText("Your teams")).toBeVisible();

  const opsBlock = rail(page).locator(
    `[data-sidebar-drop-section="${OPS_TEAM}"]`,
  );
  await opsBlock.getByRole("button", { name: "New agent" }).click();
  await openCopyWizard(page);
  const dialog = createDialog(page);
  await dialog.getByRole("button", { name: "Houston", exact: true }).click();
  await expect(dialog.getByText("Based on Houston"))
    .toBeVisible()
    .catch(async () => {
      // Walk past whichever content screens the seed fills.
      for (let i = 0; i < 4; i++) {
        if (await dialog.getByText("Based on Houston").isVisible()) break;
        await next(page);
      }
    });
  await expect(dialog.getByText("Based on Houston")).toBeVisible();
  await dialog.getByRole("button", { name: "Create Agent" }).click();
  await expect(dialog).toBeHidden();

  // The copy sits in Operations, its rail row is the current one, and the
  // screen is the copy's own board: not the default team's.
  await expect(opsBlock).toContainText("Houston copy");
  await expect(litRows(opsBlock.locator("[data-sidebar-item]"))).toContainText(
    "Houston copy",
  );
  await expect(screen(page).locator("[data-agent-screen]")).toContainText(
    "Houston copy",
  );
});
