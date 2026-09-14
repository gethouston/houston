import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";
import { openAssistant } from "./support/settings-nav";

for (const surface of ["manager", "mission"] as const) {
  test(`${surface} connects a provider securely and resumes once`, async ({
    page,
    request,
  }) => {
    const sent: Record<string, unknown>[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/conversations\/[^/]+\/messages$/.test(req.url())
      ) {
        sent.push(req.postDataJSON() as Record<string, unknown>);
      }
    });
    await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
      data: {
        interaction: {
          steps: [
            {
              kind: "provider_connect",
              id: "pc1",
              provider: "openrouter",
              reason: "Connect OpenRouter for this task.",
            },
          ],
        },
      },
    });
    if (surface === "manager") {
      await page.goto("/");
      await openAssistant(page);
      const composer = page.getByPlaceholder("Send a follow-up...");
      await composer.fill("Connect OpenRouter for my agents");
      await composer.press("Enter");
    } else {
      await startMission(page, "Connect OpenRouter for this task");
    }
    await expect(
      page.getByText("Connect OpenRouter for this task.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

    await page.getByRole("button", { name: "Connect", exact: true }).click();
    const field = page.locator("#provider-api-key");
    await expect(field).toHaveAttribute("type", "password");
    const secret = "sk-or-test-secret-never-in-chat";
    await field.fill(secret);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .locator('[data-conversation-message-key^="user-"]')
        .filter({ hasText: secret }),
    ).toHaveCount(0);
    await expect(
      page
        .locator('[data-conversation-message-key^="user-"]')
        .filter({ hasText: "Connected OpenRouter" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Connect OpenRouter for this task.", { exact: true }),
    ).toHaveCount(0);
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[1].provider).toBe(sent[0].provider);
    expect(sent[1].model).toBe(sent[0].model);
    expect(JSON.stringify(sent)).not.toContain(secret);
  });
}

test("canceling provider key entry leaves the connection request actionable", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          { kind: "provider_connect", id: "pc1", provider: "openrouter" },
        ],
      },
    },
  });
  await startMission(page, "Set up OpenRouter");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeEnabled();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});

/**
 * GitHub Copilot is ONE card with two sign-in homes (github.com vs a company
 * GitHub Enterprise domain), so its Connect asks WHERE before starting the
 * device-code login. Picking a plan CLOSES that dialog — and a close read as
 * "the user walked away" cancels the connection observation behind the step, so
 * the sign-in the pick just started is never observed and the agent never
 * resumes (Sep 2026 review). `closeMeansCancel` is the unit-level guard; these
 * pin the user-visible halves.
 */
test("picking a Copilot plan starts the sign-in from the connect step", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "provider_connect",
            id: "pc1",
            provider: "github-copilot",
            reason: "Connect GitHub Copilot for this task.",
          },
        ],
      },
    },
  });
  await startMission(page, "Set up GitHub Copilot");
  await page.getByRole("button", { name: "Connect", exact: true }).click();

  const plan = page.getByRole("dialog", { name: "Connect GitHub Copilot" });
  await expect(plan).toBeVisible();
  await plan.getByRole("button", { name: "Continue", exact: true }).click();

  // The plan dialog is gone and the step is now WAITING on the sign-in it
  // started — not back on an idle Connect, which is what an abandoned step
  // would show.
  await expect(plan).toHaveCount(0);
  await expect(page.getByText("Waiting for you to connect")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Cancel connection" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});

test("dismissing the Copilot plan dialog leaves the connection request actionable", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          { kind: "provider_connect", id: "pc1", provider: "github-copilot" },
        ],
      },
    },
  });
  await startMission(page, "Set up GitHub Copilot");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Connect GitHub Copilot" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeEnabled();
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);
});
