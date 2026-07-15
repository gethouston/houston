import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

test("first-run segment screen persists the choice and does not reappear", async ({
  page,
  request,
}) => {
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as {
    id: string;
  }[];
  for (const agent of agents) {
    await request.delete(`${FAKE_HOST_URL}/agents/${agent.id}`);
  }

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "What best describes your work?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Marketing/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Something else/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByRole("button", { name: /Operations/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Continuing lands on the create-your-assistant flow, which opens directly
  // on its connect step (the welcome/intro screen was removed).
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "What best describes your work?" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();
});
