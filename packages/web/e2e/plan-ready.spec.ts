import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";

/** Plan-ready renders a compact lede above two explicit continuation choices. */

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
    "Give feedback on the plan...",
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

test("renders an empty-summary plan card without a lede and keeps its input actionable", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] },
    },
  });
  await startMission(page, "prepare the launch");

  await expect(page.getByText("Plan ready", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  // No lede on an empty summary — scope to the card; board mission cards
  // elsewhere on the page also use line-clamp-2.
  const card = page
    .locator("div.overflow-clip")
    .filter({ hasText: "Plan ready" });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".line-clamp-2")).toHaveCount(0);
  // The row buttons' accessible names include their description line, so
  // match by substring (Playwright's default), never exact.
  await expect(
    page.getByRole("button", { name: "Continue in Ask first mode" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue in Autopilot mode" }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: /Continue in/ })).toHaveCount(
    2,
  );

  const input = page.getByPlaceholder("Give feedback on the plan...", {
    exact: true,
  });
  await input.fill("Add a launch checklist.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .locator(".is-user")
      .filter({ hasText: "Add a launch checklist." })
      .first(),
  ).toBeVisible({ timeout: 15_000 });
});

test("a dismissed plan card does not suppress a plan card from the next turn", async ({
  page,
  request,
}) => {
  const interaction = {
    steps: [{ kind: "plan_ready", id: "p1", summary: "Ready to proceed." }],
  };
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction },
  });
  await startMission(page, "prepare the launch");
  await expect(page.getByText("Plan ready", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator("div.overflow-clip")
    .filter({ hasText: "Plan ready" })
    .getByRole("button", { name: "Dismiss", exact: true })
    .click();
  await expect(page.getByText("Plan ready", { exact: true })).toHaveCount(0);

  const composer = page.getByPlaceholder("Send a follow-up...", {
    exact: true,
  });
  await composer.fill("Revise the plan.");
  await composer.press("Enter");
  // Wait for this turn to settle before staging another offer. Staging while a
  // turn remains open attaches the interaction to that earlier done frame.
  await expect(
    page.getByText('Roger that. You said: "Revise the plan."'),
  ).toBeVisible();

  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction },
  });
  await composer.fill("Show the revised plan.");
  await composer.press("Enter");
  await expect(page.getByText("Plan ready", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
