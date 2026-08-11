import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { startInAppOnboarding } from "./support/tour-nav";

/**
 * The in-app onboarding overlay (in-app-onboarding.tsx): the guided setup that
 * runs OVER the workspace shell. "Guide me" (the help control in the rail's
 * footer) is its in-shell entry point; a first-run boot arms the same overlay
 * after the survey (onboarding-survey.spec.ts covers that seam).
 */

test("Guide me opens the onboarding welcome with Continue as the only action", async ({
  page,
}) => {
  await page.goto("/");
  await startInAppOnboarding(page);

  const dialog = page.getByRole("dialog", { name: "Welcome to Houston!" });
  await expect(dialog).toBeVisible();

  // The welcome beat deliberately offers ONE action — no skip, no back.
  await expect(dialog.getByRole("button")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Start setup" }),
  ).toBeVisible();

  // The shell stays rendered behind the card (the overlay's own scrim and
  // blockers do the isolating; the shell is deliberately not inert).
  await expect(page.locator("main[data-tour-target='main']")).toBeVisible();
});

test("an already-connected user still walks every step and gets acknowledged", async ({
  page,
}) => {
  await page.goto("/");
  await startInAppOnboarding(page);

  // Every user walks EVERY step — the tutorial teaches where things live, so
  // nothing is skipped for being already done.
  await page.getByRole("button", { name: "Start setup" }).click();
  await expect(
    page.getByRole("dialog", { name: "Connect your AI" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();

  await expect(
    page.getByRole("dialog", { name: "Click AI Models" }),
  ).toBeVisible();
  await page.locator("[data-tour-target='nav-ai-hub']").click();
  await expect(
    page.getByRole("heading", { name: "AI Providers" }),
  ).toBeVisible();

  // The seeded workspace already has Claude connected: the instruction still
  // stands (the step teaches where things live), with an addendum under a
  // hairline acknowledging the existing connection and offering to skip.
  const chip = page.getByRole("dialog", {
    name: "Pick the AI you already use.",
  });
  await expect(chip).toBeVisible();
  await expect(
    chip.getByText("You already have an AI connected."),
  ).toBeVisible();
  await chip.getByRole("button", { name: "Skip step" }).click();

  // No integrations on the default deployment → straight to the agent
  // sequence. The seeded agent triggers the addendum skip here too.
  await expect(
    page.getByRole("dialog", { name: "Create your first agent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();
  const agentChip = page.getByRole("dialog", { name: "Click New agent" });
  await expect(agentChip).toBeVisible();
  await expect(agentChip.getByText("You already have an agent.")).toBeVisible();
  await agentChip.getByRole("button", { name: "Skip step" }).click();

  // The first-task sequence: the REAL New task button, then the REAL
  // composer in the panel the user's own click opened.
  await expect(
    page.getByRole("dialog", { name: "Give it work" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(
    page.getByRole("dialog", { name: "Click New task" }),
  ).toBeVisible();
  await page
    .locator("[data-screen-active='true'] [data-tour-target='newMission']")
    .click();
  await expect(
    page.getByRole("dialog", { name: "Tell it what you need." }),
  ).toBeVisible();
  await page
    .getByPlaceholder("What should the agent work on?")
    .fill("Plan my week");
  await page.getByPlaceholder("What should the agent work on?").press("Enter");

  // The send is the goal — the finale celebrates and hands the shell back.
  const finale = page.getByRole("dialog", { name: "Task sent!" });
  await expect(finale).toBeVisible();
  await finale.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The shell is interactive again: the help control opens its menu.
  await page.locator('[data-tour-target="appTour"]').click();
  await expect(
    page.getByRole("menuitem", { name: "Guide me", exact: true }),
  ).toBeVisible();
});

test("with integrations served, the flow continues into the apps sequence", async ({
  page,
  request,
}) => {
  // The integrations sequence exists only where the host serves Composio;
  // the default e2e capabilities don't, so arm them first.
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });

  await page.goto("/");
  await startInAppOnboarding(page);
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await page.locator("[data-tour-target='nav-ai-hub']").click();
  // Seeded Claude connection → the AI step's addendum skip hands off to the
  // integrations intro instead of ending the flow.
  await page
    .getByRole("dialog", { name: "Pick the AI you already use." })
    .getByRole("button", { name: "Skip step" })
    .click();

  await expect(
    page.getByRole("dialog", { name: "Connect your apps" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me" }).click();

  await expect(
    page.getByRole("dialog", { name: "Click Integrations" }),
  ).toBeVisible();
  await page.locator("[data-tour-target='nav-integrations']").click();

  // The REAL Integrations view opened; the fake host seeds one active gmail
  // connection, so the connect step shows its addendum and skips onward into
  // the agent sequence (walked end to end in the test above).
  const chip = page.getByRole("dialog", { name: "Connect your email." });
  await expect(chip).toBeVisible();
  await expect(
    chip.getByText("You already have an app connected."),
  ).toBeVisible();
  await chip.getByRole("button", { name: "Skip step" }).click();
  await expect(
    page.getByRole("dialog", { name: "Create your first agent" }),
  ).toBeVisible();
});

test("creating an agent in the tutorial: coached dialog, locked email task, inbox finale", async ({
  page,
  request,
}) => {
  // Email mode needs the connections query live (composio capability) — the
  // seeded gmail connection then arms the guided email first task.
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });

  await page.goto("/");
  await startInAppOnboarding(page);
  await page.getByRole("button", { name: "Start setup" }).click();
  await page.getByRole("button", { name: "Show me" }).click();
  await page.locator("[data-tour-target='nav-ai-hub']").click();
  await page
    .getByRole("dialog", { name: "Pick the AI you already use." })
    .getByRole("button", { name: "Skip step" })
    .click();
  await page.getByRole("button", { name: "Show me" }).click();
  await page.locator("[data-tour-target='nav-integrations']").click();
  await page
    .getByRole("dialog", { name: "Connect your email." })
    .getByRole("button", { name: "Skip step" })
    .click();

  // The agent sequence — this time creating for REAL through the dialog,
  // coached inside it: pick "Create new", then name it.
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(
    page.getByRole("dialog", { name: "Click New agent" }),
  ).toBeVisible();
  await page.locator("[data-tour-target='newAgent']").first().click();
  // In-dialog chips live outside the modal's a11y subtree (Radix marks the
  // rest of the page aria-hidden), so address them by text, not role.
  await expect(page.getByText("Click Create new")).toBeVisible();
  await page.getByRole("button", { name: "Create new", exact: true }).click();
  await expect(
    page.getByText("Pick a color and give it a name."),
  ).toBeVisible();
  await page
    .getByPlaceholder("e.g. Product manager, Sales, Jerry")
    .fill("Mailer");
  await page.getByRole("button", { name: "Create Agent" }).click();

  // Created → celebration. The tutorial suppressed the auto setup mission,
  // so no chat panel opened on its own.
  const created = page.getByRole("dialog", { name: "Agent created!" });
  await expect(created).toBeVisible();
  await created.getByRole("button", { name: "Continue" }).click();

  // The guided email first task: prewritten, locked, just send. Script the
  // agent's reply to carry the completion marker BEFORE the send.
  await request.post(`${FAKE_HOST_URL}/__test__/chat-reply`, {
    data: { text: "Sent! Check your inbox.\n[TUTORIAL_COMPLETE]" },
  });
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(
    page.getByRole("dialog", { name: "Click New task" }),
  ).toBeVisible();
  await page
    .locator("[data-screen-active='true'] [data-tour-target='newMission']")
    .click();
  // The just-created agent is pinned on its board (agentFilter), so the
  // New-task click composes directly, no agent menu.
  await expect(
    page.getByRole("dialog", { name: "Just press send." }),
  ).toBeVisible();
  // The composer is prewritten and locked; the hole narrows to the send
  // button alone — the click goes through it.
  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toHaveValue("Send me a hello email");
  await page
    .locator('[data-testid="mission-panel"] button[type="submit"]')
    .click();

  // The working beat holds until the agent's reply carries the marker, then
  // the finale sends the user to their inbox.
  const finale = page.getByRole("dialog", { name: "Check your inbox!" });
  await expect(finale).toBeVisible();
  await finale.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
