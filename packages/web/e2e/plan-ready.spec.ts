import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";

/** Plan-ready renders a compact lede above three explicit continuation choices. */

test("keeps a large plan approval compact, collapsible, and actionable", async ({
  page,
  request,
}) => {
  const summary = Array.from(
    { length: 40 },
    (_, index) => `Step ${index + 1} prepares the launch safely.`,
  ).join(" ");
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [{ kind: "plan_ready", id: "p1", summary }],
      },
    },
  });

  await startMission(page, "prepare the launch");

  await expect(page.getByText("Plan ready")).toBeVisible({ timeout: 15_000 });
  const lede = page.getByText(summary);
  const ledeHeight = await lede.evaluate((element) => element.clientHeight);
  const lineHeight = await lede.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).lineHeight),
  );
  expect(ledeHeight).toBeLessThanOrEqual(Math.ceil(lineHeight * 2));
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue in Ask first mode" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Collapse plan approval" }).click();
  // Collapsed: the body (and its actions) unmounts; a truncated one-line hint
  // keeps the lede readable in the header, and the transcript stays visible.
  await expect(
    page.getByRole("button", { name: "Continue in Ask first mode" }),
  ).toBeHidden();
  await expect(page.getByText(summary)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expand plan approval" }),
  ).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible();

  await page.getByRole("button", { name: "Expand plan approval" }).click();
  await expect(lede).toBeVisible();
  const integratedInput = page.getByPlaceholder(
    "Or tell it what to do instead...",
    { exact: true },
  );
  await expect(integratedInput).toBeVisible();
  await expect(
    page.getByPlaceholder("Send a follow-up...", { exact: true }),
  ).toBeHidden();
  await integratedInput.fill("Add a launch checklist before starting.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  // Scope to the user bubble: the fake host's echo repeats the same text.
  await expect(
    page
      .locator(".is-user")
      .filter({ hasText: "Add a launch checklist before starting." })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Plan ready", { exact: true })).toBeHidden();
  // After the follow-up turn settles the card stays retired (the interaction
  // was cleared at turn start) and the normal composer returns.
  await expect(
    page.getByText(
      'Roger that. You said: "Add a launch checklist before starting."',
    ),
  ).toBeVisible();
  await expect(page.getByText("Plan ready", { exact: true })).toBeHidden();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});
