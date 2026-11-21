import { SEED_AGENT_NAME } from "@houston/fake-host";
import {
  COPY_SOURCE,
  createDialog,
  next,
  openCopyWizard,
  rowSwitch,
  seedCopySource,
} from "../support/copy-agent";
import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

test("copies an agent from the Agents home on the phone", async ({
  page,
  request,
}) => {
  await seedCopySource(request);
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");

  await screen(page).getByTestId("agents-home-new-agent").click();
  const dialog = createDialog(page);
  await expect(
    dialog.getByRole("heading", { name: "How do you want to start?" }),
  ).toBeVisible();

  await openCopyWizard(page);
  await dialog
    .getByRole("button", { name: SEED_AGENT_NAME, exact: true })
    .click();
  await expect(rowSwitch(page, "Job description and rules")).toBeChecked();
  await rowSwitch(page, COPY_SOURCE.learnings[0]).click();
  await next(page);
  await expect(rowSwitch(page, COPY_SOURCE.routine.name)).toBeChecked();
  await next(page);
  await expect(rowSwitch(page, "Invoice Triage")).toBeChecked();
  await next(page);

  await expect(dialog.getByText(`Based on ${SEED_AGENT_NAME}`)).toBeVisible();
  await dialog.getByRole("button", { name: "Create AI Employee" }).click();
  await expect(dialog).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  const taskList = page.getByTestId("agent-missions-screen");
  await expect(
    taskList.getByRole("heading", {
      level: 1,
      name: `${SEED_AGENT_NAME} copy`,
    }),
  ).toBeVisible();
});
