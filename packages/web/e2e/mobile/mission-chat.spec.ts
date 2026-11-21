import { FAKE_HOST_URL } from "@houston/fake-host";
import {
  FOLLOW_UP_PLACEHOLDER,
  NEW_TASK_PLACEHOLDER,
} from "../support/composer";
import { expect, test } from "../support/fixtures";
import {
  awaitAgentsHome,
  newTaskButton,
  openPhoneTeamSection,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

test("a task row pushes the chat; back returns to the list", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");
  await screen(page).getByText("Plan a trip to Tokyo").tap();

  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  await expect(chat.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await chat.getByTestId("mission-chat-back").tap();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
});

test("a follow-up sent from the pushed chat round-trips", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();

  const chat = page.getByTestId("mission-chat-screen");
  const composer = chat.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill("Also check the trains");
  await composer.press("Enter");

  await expect(
    chat.getByText("Also check the trains", { exact: true }),
  ).toBeVisible();
  await expect(chat.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
});

test("the compose draft chat creates its mission on first send", async ({
  page,
}) => {
  await page.goto("/");
  await newTaskButton(page).tap();

  const chat = page.getByTestId("mission-chat-screen");
  const composer = chat.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill("Book a hotel in Kyoto");
  await composer.press("Enter");

  await expect(chat.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
  await page.goBack();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
});

test("an archived task opens as the pushed chat, and a send revives it", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: {
      id: "archived-quarterly-review",
      title: "Quarterly review",
      status: "archived",
    },
  });
  await page.goto("/");
  await (await awaitAgentsHome(page)).tap();
  const list = page.getByTestId("agent-missions-screen");
  await list.getByTestId("agent-missions-archived-toggle").tap();
  await list.getByText("Quarterly review").tap();

  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat.getByText("Task: Quarterly review")).toBeVisible();
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");

  const composer = chat.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await composer.fill("Pick this back up");
  await composer.press("Enter");
  await expect(
    chat.getByText("Pick this back up", { exact: true }),
  ).toBeVisible();
  await expect(chat.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });

  await chat.getByTestId("mission-chat-back").tap();
  await expect(list).toBeVisible();
});
