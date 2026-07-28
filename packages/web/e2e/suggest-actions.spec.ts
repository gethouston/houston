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

test("suggested action pills stay above the composer, send visibly, and dismiss", async ({
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
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
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
