import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { openPhoneTeamSection } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

async function seedRoutine(name: string): Promise<void> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  await fetch(`${FAKE_HOST_URL}/agents/${agents[0].id}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, prompt: "p", schedule: "0 9 * * *" }),
  });
}

async function horizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test("a routine opens as its own screen from the phone employee screen", async ({
  page,
}) => {
  await seedRoutine("Morning digest");

  await page.goto("/");
  await openPhoneTeamSection(page, "routines");

  const row = screen(page)
    .getByTestId("routine-row")
    .filter({ hasText: "Morning digest" });
  await expect(row).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await row.getByText("Morning digest").tap();
  const detail = page.getByTestId("routine-screen");
  await expect(
    detail.getByRole("heading", { name: "Morning digest" }),
  ).toBeVisible();
  await expect(detail.getByRole("button", { name: "Runs" })).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Edit in chat" }),
  ).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await detail.getByRole("button", { name: "Back" }).tap();
  await expect(page.getByTestId("routine-screen")).toHaveCount(0);
  await expect(
    screen(page)
      .getByTestId("routine-row")
      .filter({ hasText: "Morning digest" }),
  ).toBeVisible();
});
