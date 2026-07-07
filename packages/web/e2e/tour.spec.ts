import { expect, test } from "./support/fixtures";

test("Guide me tour shows the replay-tour step last", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Guide me" }).click();

  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByText(/^Tour \d+ of \d+$/) });
  const title = dialog.getByRole("heading", { level: 2 });
  await expect(dialog).toBeVisible();

  for (let guard = 0; guard < 20; guard++) {
    if ((await title.textContent()) === "Replay the tour") break;
    await dialog.getByRole("button", { name: "Next" }).click();
  }

  await expect(title).toHaveText("Replay the tour");
  await expect(dialog.getByRole("button", { name: "Got it" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next" })).toHaveCount(0);

  const counter = await dialog.getByText(/^Tour \d+ of \d+$/).textContent();
  const match = /^Tour (\d+) of (\d+)$/.exec(counter ?? "");
  expect(match?.[1]).toBe(match?.[2]);
});
