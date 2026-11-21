import type { Page } from "@playwright/test";
import { createAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { openAgentSettings, screen } from "./support/team-nav";

function briefControl(page: Page, field: "industry" | "role") {
  return screen(page).getByRole("button", {
    name: new RegExp(`^Change ${field}: `),
  });
}

function descriptionBox(page: Page) {
  return page.getByLabel("Specific instructions");
}

test("the Job description opens on the brief, and the rows rewrite it", async ({
  page,
}) => {
  await page.goto("/");
  await createAgent(page, "Coda");
  await openAgentSettings(page, "Coda");

  await expect(screen(page).getByText("Industry")).toBeVisible();
  await expect(screen(page).getByText("Role")).toBeVisible();
  await expect(briefControl(page, "industry")).toHaveText("Finance");
  await expect(briefControl(page, "role")).toHaveText("Financial analyst");

  await expect(
    screen(page).getByRole("heading", { name: "Specific instructions" }),
  ).toBeVisible();
  await expect(descriptionBox(page)).toHaveText("");
  await expect(
    page.getByText("Write instructions for your AI Employee…"),
  ).toBeVisible();

  await briefControl(page, "role").click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("textbox", { name: "Search roles" })
    .fill("Bookkeeper");
  await picker.getByRole("radio", { name: "Bookkeeper", exact: true }).click();

  await expect(picker).toBeHidden();
  await expect(briefControl(page, "role")).toHaveText("Bookkeeper");
  await expect(briefControl(page, "industry")).toHaveText("Finance");

  await page.reload();
  await openAgentSettings(page, "Coda");
  await expect(briefControl(page, "role")).toHaveText("Bookkeeper");
  await expect(briefControl(page, "industry")).toHaveText("Finance");
  await expect(descriptionBox(page)).toHaveText("");
});
