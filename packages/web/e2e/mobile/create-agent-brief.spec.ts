import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

test('"Something else" answers in the row, with a way back for a thumb', async ({
  page,
}) => {
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await screen(page).getByTestId("agents-home-new-agent").tap();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create a new AI Employee" }).tap();

  const filter = dialog.getByRole("textbox", { name: "Search industries" });
  const door = dialog.getByRole("button", { name: "Something else" });
  const answer = dialog.getByRole("textbox", {
    name: "Tell us in a few words",
  });
  await expect(filter).toBeVisible();

  await door.tap();
  await expect(filter).toHaveCount(0);
  await expect(answer).toBeVisible();
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);

  await cancel.tap();
  await expect(answer).toHaveCount(0);
  await expect(filter).toBeVisible();
  await expect(door).toBeVisible();

  await door.tap();
  await answer.fill("Falconry");
  await dialog.getByRole("button", { name: "Continue" }).tap();
  await expect(
    dialog.getByRole("heading", { name: "What should it do for you?" }),
  ).toBeVisible();
});
