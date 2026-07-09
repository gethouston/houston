import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * When the agent modifies the OPEN routine from the setup chat, the editor
 * refreshes in real time and the changed section lights up (the
 * `routine-section-flash` animation) so the user can attribute the change.
 * Here the "agent" is a REST PATCH against the fake host — the same
 * RoutinesChanged event path a real agent edit rides.
 */

async function seedAgentId(): Promise<string> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  return agents[0].id;
}

test("an agent edit refreshes the open editor and flashes the changed section", async ({
  page,
}) => {
  const agentId = await seedAgentId();
  const created = (await (
    await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Morning digest",
        prompt: "Summarize my inbox.",
        schedule: "0 9 * * *",
      }),
    })
  ).json()) as { id: string };

  await page.goto("/");
  await page.locator('[data-tour-target="tab-routines"]').click();
  await page.getByText("Morning digest").first().click();
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible({
    timeout: 10_000,
  });
  // No flash on plain open.
  await expect(page.locator(".routine-section-flash")).toHaveCount(0);

  // The "agent" moves the schedule to 6 PM while the editor is open.
  await fetch(`${FAKE_HOST_URL}/agents/${agentId}/routines/${created.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schedule: "0 18 * * *" }),
  });

  // The schedule section lights up — and ONLY the schedule section.
  const flashed = page.locator("section.routine-section-flash");
  await expect(flashed).toHaveCount(1, { timeout: 15_000 });
  await expect(flashed).toContainText("When it runs");
  await page.screenshot({
    path: test.info().outputPath("routine-agent-edit-flash.png"),
  });

  // …and the form really shows the agent's change (6:00 PM daily): both the
  // next-run preview AND the schedule picker itself re-derive from the new
  // cron — the picker must never keep showing the pre-edit time.
  await expect(
    page
      .getByText("today at 6:00 PM")
      .or(page.getByText("tomorrow at 6:00 PM")),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Runs every day at 6:00 PM")).toBeVisible();
});
