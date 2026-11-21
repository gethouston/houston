import { SEED_AGENT_NAME } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAgentSettings } from "./support/team-nav";

async function openMemory(page: Page) {
  await page.goto("/");
  await openAgentSettings(page, SEED_AGENT_NAME, "Learnings");
}

test("a learning shows the person who taught it and its mission", async ({
  page,
}) => {
  await openMemory(page);

  const stamped = page
    .locator("article")
    .filter({ hasText: "Exclude churned accounts from pipeline math." });
  await expect(stamped).toBeVisible();
  await expect(
    stamped.getByText("From Ada Lovelace · Plan a trip to Tokyo"),
  ).toBeVisible();
  await expect(stamped.getByText("AL", { exact: true })).toBeVisible();
});

test("a learning with no provenance renders no provenance line", async ({
  page,
}) => {
  await openMemory(page);

  const plain = page
    .locator("article")
    .filter({ hasText: "Prefers metric units in every report." });
  await expect(plain).toBeVisible();
  await expect(plain.getByText(/^From /)).toHaveCount(0);
});

test("the provenance line survives an edit and stays out of the editor", async ({
  page,
}) => {
  await openMemory(page);

  const stamped = page.locator("article").first();
  await expect(stamped).toContainText(
    "Exclude churned accounts from pipeline math.",
  );
  await stamped.getByRole("button", { name: "Edit learning" }).click();

  const editor = stamped.getByRole("textbox");
  await expect(editor).toBeVisible();
  await expect(stamped.getByText(/^From /)).toHaveCount(0);

  await editor.fill("Exclude churned accounts, and dormant ones too.");
  await stamped.getByRole("button", { name: "Save" }).click();

  await expect(stamped).toContainText(
    "Exclude churned accounts, and dormant ones too.",
  );
  await expect(
    stamped.getByText("From Ada Lovelace · Plan a trip to Tokyo"),
  ).toBeVisible();
});
