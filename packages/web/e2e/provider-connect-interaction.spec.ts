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
