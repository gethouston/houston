import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/** Activity's archived-mission control and its navigation reset contract. */
test("the Activity archived button swaps to archived missions and back", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "archived-quarterly-review",
      title: "Quarterly review",
      status: "archived",
    },
  });
  await page.goto("/");

  const archived = page.getByRole("button", { name: "Archived" });
  await expect(archived).toBeVisible();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);

  await archived.click();
  await expect(page.getByText("Quarterly review")).toBeVisible();

  await archived.click();
  await expect(page.getByText("Quarterly review")).toHaveCount(0);
});

test("switching tabs resets the archived view", async ({ page, request }) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: "archived-reset", title: "Reset me", status: "archived" },
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Archived" }).click();
  await expect(page.getByText("Reset me")).toBeVisible();
  await page.locator('[data-tour-target="tab-files"]').click();
  await page.locator('[data-tour-target="tab-activity"]').click();
  await expect(page.getByText("Reset me")).toHaveCount(0);
});
