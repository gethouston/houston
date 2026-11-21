import { FAKE_HOST_URL } from "@houston/fake-host";
import { NEW_TASK_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { openNewMission } from "./support/mission";

test("a stream that attaches mid-turn, ahead of the send's answer, still streams the reply", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-config`, {
    data: { replyDelayMs: 2_500, holdAfterFirstDelta: true },
  });
  let admitted: () => void = () => {};
  const turnAdmitted = new Promise<void>((resolve) => {
    admitted = resolve;
  });
  await page.route(/\/conversations\/[^/?]+\/messages$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    admitted();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ response });
  });
  await page.route(/\/conversations\/[^/?]+\/events(\?|$)/, async (route) => {
    await turnAdmitted;
    await route.continue();
  });

  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await composer.fill("late subscriber");
  await composer.press("Enter");

  await expect(page.getByText(/Roger that/).first()).toBeVisible({
    timeout: 15_000,
  });

  await request.post(`${FAKE_HOST_URL}/__test__/drop-chat-streams`);
  await expect(page.getByText(/You said: .late subscriber./)).toBeVisible({
    timeout: 15_000,
  });
});
