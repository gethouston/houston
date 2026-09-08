import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

test("a browser keeps the manual connection flow when the gateway supports desktop bridges", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: {
      openaiCompatible: true,
      localModelBridge: { versions: [1] },
    },
  });
  const managementRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v1/local-model-bridges"))
      managementRequests.push(request.url());
  });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-ai-hub"]').click();
  await page.getByRole("button", { name: /^Connect Local model/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Enter details manually" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Server address")).toBeVisible();
  await expect(dialog.getByLabel("Model", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Looking for model apps on your computer..."),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(managementRequests).toEqual([]);
});
