import { expect, test } from "./support/fixtures";

test("Guide me tour places replay before the final closing step", async ({
  page,
}) => {
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
  await expect(dialog.getByRole("button", { name: "Next" })).toBeVisible();

  const counter = await dialog.getByText(/^Tour \d+ of \d+$/).textContent();
  const match = /^Tour (\d+) of (\d+)$/.exec(counter ?? "");
  expect(Number(match?.[1])).toBe(Number(match?.[2]) - 1);

  await dialog.getByRole("button", { name: "Next" }).click();
  await expect(title).toHaveText("Now go build something amazing");
  await expect(
    dialog.getByRole("button", { name: "I'll do something amazing" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Next" })).toHaveCount(0);
});
