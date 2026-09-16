import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * The guided brief's typed answer on a phone. It is the same row swap the
 * desktop does (`choice-row.tsx`), with the one difference a phone forces:
 * there is no Escape key, so the way back out of the answer is a control
 * beside Continue rather than a keystroke.
 */
test('"Something else" answers in the row, with a way back for a thumb', async ({
  page,
}) => {
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await screen(page).getByTestId("agents-home-new-agent").tap();

  // The seeded roster gives the dialog its opening choice; hiring is the door
  // the guided brief lives behind.
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Hire a new AI Employee" }).tap();

  const filter = dialog.getByRole("textbox", { name: "Search industries" });
  const door = dialog.getByRole("button", { name: "Something else" });
  const answer = dialog.getByRole("textbox", {
    name: "Tell us in a few words",
  });
  await expect(filter).toBeVisible();

  // The row swaps in place: the filter's slot is the answer, and the door's
  // slot is Continue, with Cancel beside it where a thumb can reach it.
  await door.tap();
  await expect(filter).toHaveCount(0);
  await expect(answer).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();

  // Nothing about the swap forced the document wider than the phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  // Cancel gives the question back exactly as it stood.
  await cancel.tap();
  await expect(answer).toHaveCount(0);
  await expect(filter).toBeVisible();
  await expect(door).toBeVisible();

  // And a typed answer still answers: Continue carries it into the next
  // question, the job the agent takes over.
  await door.tap();
  await answer.fill("Falconry");
  await dialog.getByRole("button", { name: "Continue" }).tap();
  await expect(
    dialog.getByRole("heading", { name: "What should it do for you?" }),
  ).toBeVisible();
});
