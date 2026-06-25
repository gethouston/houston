import { expect, test } from "./support/fixtures";

/**
 * The core loop: open a new conversation, send a message, and watch the streamed
 * reply render. The fake host streams a canned reply over SSE (text deltas →
 * usage → done), exactly like the real runtime, so this exercises the whole
 * chat pipeline: composer → createMission → startSession → SSE → feed render.
 */
test("sends a message and renders the streamed reply", async ({ page }) => {
  await page.goto("/");

  // The header "New mission" button (a tour anchor, so a stable selector). There
  // is a second "New mission" affordance — the "+" card in the Running column.
  await page.locator('[data-tour-target="newMission"]').click();

  const composer = page.getByPlaceholder("What should the agent work on?");
  await expect(composer).toBeVisible();

  await composer.fill("plan my week");
  await composer.press("Enter");

  // The user's message renders optimistically.
  await expect(page.getByText("plan my week").first()).toBeVisible();

  // The streamed assistant reply (canned by the fake host). Match without the
  // quotes so a markdown smart-quote transform can't flake the assertion.
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

/** Sending with the composer's Submit button, not the Enter key. */
test("sends a message with the Submit button", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();

  await page
    .getByPlaceholder("What should the agent work on?")
    .fill("water the plants");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("water the plants").first()).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

/** Replying inside an EXISTING mission (the follow-up composer), not a new one. */
test("sends a follow-up inside an existing mission", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder("Send a follow-up...");
  await expect(composer).toBeVisible();

  await composer.fill("what about the budget?");
  await composer.press("Enter");

  await expect(page.getByText("what about the budget?").first()).toBeVisible();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});
