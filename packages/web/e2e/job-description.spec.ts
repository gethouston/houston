import type { Page } from "@playwright/test";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { openAgentSettings, screen } from "./support/team-nav";

/**
 * An agent's Job description is ONE file structured like a skill: a short block
 * of facts (the industry it works in, the job it fills) over the free
 * description the user and the agent both write into.
 *
 * The tab draws that shape as a FORM in the Settings screen's grammar — the two
 * facts as two settings rows, each opening the very question the create flow
 * asked, over "Specific instructions" and its editor — so this walks the whole
 * round trip: created from the brief, read back off the rows, changed through
 * the picker, and still there after a reload, which is what proves the pick
 * reached the file rather than only the screen.
 *
 * `fillAgentBrief` answers the brief with real catalog chips (Finance, then
 * Financial analyst), so those are the facts expected below.
 */

/** One of the two fact controls, by the name it speaks with an answer on it. */
function briefControl(page: Page, field: "industry" | "role") {
  return screen(page).getByRole("button", {
    name: new RegExp(`^Change ${field}: `),
  });
}

/** The description editor itself, named by the section that titles it. */
function descriptionBox(page: Page) {
  return page.getByLabel("Specific instructions");
}

test("the Job description opens on the brief, and the rows rewrite it", async ({
  page,
}) => {
  await page.goto("/");
  await createAgent(page, "Coda");
  await openAgentSettings(page, "Coda");

  // The form says what each fact IS, beside the answer given at creation.
  await expect(screen(page).getByText("Industry")).toBeVisible();
  await expect(screen(page).getByText("Role")).toBeVisible();
  await expect(briefControl(page, "industry")).toHaveText("Finance");
  await expect(briefControl(page, "role")).toHaveText("Financial analyst");

  // Creation writes the facts and NOTHING else: the description below is the
  // user's and the agent's to write, so it opens on its greyed invitation.
  await expect(
    screen(page).getByRole("heading", { name: "Specific instructions" }),
  ).toBeVisible();
  await expect(descriptionBox(page)).toHaveText("");
  await expect(
    page.getByText("Write instructions for your AI Employee…"),
  ).toBeVisible();

  // Changing a fact goes through the very question that asked it: the filter,
  // the chips, and the same "Something else" door.
  await briefControl(page, "role").click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("textbox", { name: "Search roles" })
    .fill("Bookkeeper");
  await picker.getByRole("radio", { name: "Bookkeeper", exact: true }).click();

  // Picking answers outright: the dialog closes and the row carries the new
  // answer, with the fact beside it untouched.
  await expect(picker).toBeHidden();
  await expect(briefControl(page, "role")).toHaveText("Bookkeeper");
  await expect(briefControl(page, "industry")).toHaveText("Finance");

  // A write, not a redraw: after a reload the file still says so, and the
  // description the pick rode over is still empty.
  await page.reload();
  await openAgentSettings(page, "Coda");
  await expect(briefControl(page, "role")).toHaveText("Bookkeeper");
  await expect(briefControl(page, "industry")).toHaveText("Finance");
  await expect(descriptionBox(page)).toHaveText("");
});
