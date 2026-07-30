import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

async function startMission(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator('[data-tour-target="newMission"]').click();
  const composer = page.getByPlaceholder("What should the agent work on?");
  await composer.fill("prepare the update");
  await composer.press("Enter");
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
}

test("suggested action pills prefill the composer, send on confirm, and dismiss", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "suggest_actions",
            id: "a1",
            actions: [
              {
                id: "draft",
                label: "Draft an email",
                message: "Draft the email.",
              },
              {
                id: "share",
                label: "Share update",
                message: "Share the update.",
              },
            ],
          },
        ],
      },
    },
  });
  await startMission(page);
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();
  const followUp = page.getByPlaceholder("Send a follow-up...");
  await expect(followUp).toBeVisible();
  // HOU-1050: a pill click prefills the composer instead of sending, and the
  // pills stay up so the user can still pick a different one (each click
  // replaces the draft).
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Share update" }).click();
  await expect(followUp).toHaveValue("Share the update.");
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  // Confirming with Enter runs the normal composer send and retires the pills.
  await followUp.press("Enter");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share update", exact: true }),
  ).toHaveCount(0);
  // Wait for the prefilled send's turn to fully settle BEFORE staging the next
  // offer:
  // staging while that turn is still open races it onto the wrong done frame,
  // where the upcoming composer send would abandon it.
  await expect(
    page.getByText('Roger that. You said: "Draft the email."'),
  ).toBeVisible();

  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            ...{ kind: "suggest_actions", id: "a2" },
            actions: [
              { id: "one", label: "One", message: "One." },
              { id: "two", label: "Two", message: "Two." },
            ],
          },
        ],
      },
    },
  });
  await page.getByPlaceholder("Send a follow-up...").fill("again");
  await page.getByPlaceholder("Send a follow-up...").press("Enter");
  await expect(
    page.getByRole("button", { name: "Dismiss suggested actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss suggested actions" }).click();
  // exact: the board's "Move to done" button would otherwise substring-match.
  await expect(
    page.getByRole("button", { name: "One", exact: true }),
  ).toHaveCount(0);
});
