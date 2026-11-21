import { FAKE_HOST_URL } from "@houston/fake-host";
import { activatePendingConnection } from "./support/activate-pending-connection";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";
import { missionCard, openTeamSection } from "./support/team-nav";

test.use({ teamBoard: true });

test("collapses a blocking question without hiding its blocked header", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-collapse",
            question: "Which launch date should we use?",
            options: [
              { id: "monday", label: "Monday" },
              { id: "friday", label: "Friday" },
            ],
          },
        ],
      },
    },
  });
  await startMission(page, "schedule the launch");

  await expect(page.getByText("Which launch date should we use?")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Collapse interaction" }).click();
  await expect(
    page.getByText("Which launch date should we use?"),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand interaction" }).click();
  await expect(page.getByRole("radio")).toHaveCount(2);
});

test("keeps a long question's footer reachable in a short viewport", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-six-options",
            question: "Which launch detail should we prioritize?",
            options: [
              "Timeline",
              "Audience",
              "Budget",
              "Messaging",
              "Channels",
              "Measurement",
            ].map((label) => ({ id: label.toLowerCase(), label })),
          },
        ],
      },
    },
  });
  await startMission(page, "prepare the launch");

  const skip = page.getByRole("button", { name: /^Skip/ });
  await expect(skip).toBeInViewport({ timeout: 15_000 });
  const bodyViewport = page.locator("[data-slot=scroll-area-viewport]").last();
  await expect
    .poll(() =>
      bodyViewport.evaluate(
        (viewport) => viewport.scrollHeight > viewport.clientHeight,
      ),
    )
    .toBe(true);
  await bodyViewport.evaluate((viewport) => {
    viewport.scrollTop = viewport.scrollHeight;
  });
  await expect(page.getByRole("radio", { name: "Measurement" })).toBeVisible();
  await expect(skip).toBeInViewport();
  await page
    .getByRole("button", { name: "Collapse interaction", exact: true })
    .click();
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible();
  await page
    .getByRole("button", { name: "Expand interaction", exact: true })
    .click();
  await expect(skip).toBeInViewport();
  await skip.click();
});

test("a long option label wraps and keeps its number badge inside the card", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  const longLabel =
    "Look up the case number they send me, check its status in every registry, and reply with the full current state";
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-long-label",
            question: "What should I do when they call the webhook?",
            options: [
              { id: "lookup", label: longLabel, recommended: true },
              { id: "notify", label: "Email me whatever they send" },
            ],
          },
        ],
      },
    },
  });
  await startMission(page, "watch the court registry");

  const row = page.getByRole("radio", {
    name: new RegExp(longLabel.slice(0, 20)),
  });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const card = page.locator("[data-slot=collapsible]").filter({ has: row });
  const badge = row.locator("span", { hasText: /^1$/ }).last();
  const [cardBox, rowBox, badgeBox] = await Promise.all([
    card.boundingBox(),
    row.boundingBox(),
    badge.boundingBox(),
  ]);
  if (!cardBox || !rowBox || !badgeBox)
    throw new Error("card geometry missing");
  const cardRight = cardBox.x + cardBox.width;
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(cardRight);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(cardRight);
  const shortRow = page.getByRole("radio", { name: /Email me whatever/ });
  const shortBox = await shortRow.boundingBox();
  if (!shortBox) throw new Error("short row geometry missing");
  expect(rowBox.height).toBeGreaterThan(shortBox.height * 1.5);
  await expect(row.getByText(longLabel)).not.toHaveCSS(
    "text-overflow",
    "ellipsis",
  );
  await expect(page.getByText("Recommended")).toBeVisible();
});

test("walks three questions one at a time and composes a single structured reply", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "q2",
            question: "Anything special I should know about the trip?",
          },
          {
            kind: "question",
            id: "q3",
            question: "Morning or evening flight?",
            options: [
              { id: "morning", label: "Morning flight" },
              { id: "evening", label: "Evening flight" },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 3")).toBeVisible();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByText("Morning or evening flight?")).toHaveCount(0);

  await expect(page.getByRole("radio")).toHaveCount(2);
  await expect(page.getByPlaceholder("Type another option...")).toBeVisible();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toHaveCount(0);

  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible();
  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(composer).toHaveCount(0);

  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("Window seat please");
  await freeText.press("Enter");
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("3 of 3")).toBeVisible();

  await page.getByRole("radio", { name: "Evening flight" }).click();

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "Window seat please" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Paris");
  await expect(composed).toContainText("Evening flight");
  await expect(
    composed
      .locator("span")
      .filter({ hasText: "Which city are you flying to?" }),
  ).toBeVisible();

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 3")).toHaveCount(0);
});

test("back chevron returns to the previous answered step, pre-selected", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "q2",
            question: "Morning or evening flight?",
            options: [
              { id: "morning", label: "Morning flight" },
              { id: "evening", label: "Evening flight" },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Which city are you flying to?")).toBeVisible();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Paris" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByRole("radio", { name: "Tokyo" }).click();
  await expect(page.getByText("Morning or evening flight?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();

  await page.getByRole("radio", { name: "Evening flight" }).click();
  const composed = page.locator(".is-user").filter({ hasText: "Tokyo" });
  await expect(composed).toHaveCount(1);
  await expect(composed).toContainText("Evening flight");
  await expect(composed).not.toContainText("Paris");
});

test("single question with options sends on option click (fast path)", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Do you want the morning or evening flight?",
            options: [
              { id: "morning", label: "Morning flight" },
              { id: "evening", label: "Evening flight" },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "book my flight");

  await expect(
    page.getByText("Do you want the morning or evening flight?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  const morning = page.getByRole("radio", { name: "Morning flight" });
  await expect(morning).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);

  await morning.click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Morning flight" }),
  ).toHaveCount(1);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("radio", { name: "Evening flight" })).toHaveCount(
    0,
  );
});

test("pressing a number key selects the matching option", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  const question = page.getByText("Which city are you flying to?");
  await expect(question).toBeVisible({ timeout: 15_000 });

  await question.click();
  await page.keyboard.press("2");

  await expect(
    page.locator(".is-user").filter({ hasText: "Tokyo" }),
  ).toHaveCount(1);
});

test("advances from a question to a connect step in one sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Who should I send the itinerary to?",
          },
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toHaveCount(0);

  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible();
  const connectCard = page.locator("div.overflow-clip").filter({
    hasText: "I need access to your Gmail to send the trip itinerary.",
  });
  await expect(
    connectCard.getByText("Connect Gmail", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
});

test("advances from a question to a signin step in a three-step sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Who should I send the itinerary to?",
          },
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston so I can send email on your behalf.",
          },
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);

  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(
    page.getByText("Sign in to Houston so I can send email on your behalf."),
  ).toBeVisible();
  const signinCard = page.locator("div.overflow-clip").filter({
    hasText: "Sign in to Houston so I can send email on your behalf.",
  });
  await expect(signinCard.getByText("Houston", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
});

test("shows a lone signin step for a signin-only sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston to use your connected apps.",
          },
        ],
      },
    },
  });

  await startMission(page, "check my email");

  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
});

test("shows a lone connect step for a connect-only sequence", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
});

test("renders the app's real logo on the connect step once the catalog resolves", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "slack",
            reason: "I need Slack access to post the trip summary.",
          },
        ],
      },
    },
  });

  await startMission(page, "post the trip summary");

  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible({ timeout: 15_000 });
  const card = page
    .locator("div.overflow-clip")
    .filter({ hasText: "I need Slack access to post the trip summary." });
  await expect(card.getByText("Connect Slack", { exact: true })).toBeVisible();
  const logo = card.getByRole("img", { name: "Slack" });
  await expect(logo).toBeVisible();
  expect(await logo.getAttribute("src")).toMatch(/^data:image\/png/);
});

test("skips a lone connect step and tells the agent the user declined", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText(/Skipped connecting Gmail\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("declines a connect step with a typed instruction and resumes visibly", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toBeVisible({ timeout: 15_000 });

  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);

  await row.fill("just draft it, I'll send it from my phone");
  await row.press("Enter");

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "just draft it, I'll send it from my phone" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("I didn't connect Gmail. Instead");
  await expect(
    page.getByText("I need access to your Gmail to send the trip itinerary."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("skipping the connect step of a mixed sequence keeps the answers and records the decline", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Who should I send the itinerary to?",
          },
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  await expect(
    page.getByText("Who should I send the itinerary to?"),
  ).toBeVisible({ timeout: 15_000 });
  const freeText = page.getByPlaceholder("Type your answer...");
  await freeText.fill("john@example.com");
  await freeText.press("Enter");

  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "john@example.com" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("Skipped connecting Gmail.");
  await expect(
    page.getByRole("button", { name: "Connect", exact: true }),
  ).toHaveCount(0);
});

test("reconsiders a skipped connect step: Back offers Connect again and reports Connected", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "slack",
            reason: "I need Slack access to post the trip summary.",
          },
          {
            kind: "connect",
            id: "c2",
            toolkit: "github",
            reason: "I need GitHub access to open the tracking issue.",
          },
        ],
      },
    },
  });

  await startMission(page, "post the trip summary");

  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(
    page.getByText("I need GitHub access to open the tracking issue."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await expect(
    page.getByText("I need Slack access to post the trip summary."),
  ).toBeVisible();
  const connect = page.getByRole("button", { name: "Connect", exact: true });
  await expect(connect).toBeVisible();
  await expect(page.getByRole("button", { name: /Skip/ })).toBeVisible();

  await connect.click();
  await activatePendingConnection(request, "slack");

  await expect(page.getByText("2 of 2")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("I need GitHub access to open the tracking issue."),
  ).toBeVisible();
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText(/Connected Slack\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Skipped connecting GitHub\./)).toBeVisible();
  await expect(page.getByText(/Skipped connecting Slack\./)).toHaveCount(0);
});

test("skips a lone signin step and tells the agent the user declined", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston to use your connected apps.",
          },
        ],
      },
    },
  });

  await startMission(page, "check my email");

  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText(/Skipped signing in\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("declines a signin step with a typed instruction and resumes visibly", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "signin",
            id: "s1",
            reason: "Sign in to Houston to use your connected apps.",
          },
        ],
      },
    },
  });

  await startMission(page, "check my email");

  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toBeVisible({ timeout: 15_000 });

  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);

  await row.fill("skip the connected apps, just search the web");
  await row.press("Enter");

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "skip the connected apps, just search the web" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText("I didn't sign in. Instead");
  await expect(
    page.getByText("Sign in to Houston to use your connected apps."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("the card replaces the composer and dismiss restores it", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
  await expect(page.getByPlaceholder("Type another option...")).toHaveCount(1);

  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type another option...")).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("a draft typed into the card survives switching missions and coming back", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "q2",
            question: "Which week works?",
            options: [
              { id: "next", label: "Next week" },
              { id: "later", label: "Later" },
            ],
          },
        ],
      },
    },
  });

  await page.goto("/");
  await openTeamSection(page, "Tasks");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill("plan my trip");
  await composer.press("Enter");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });

  const freeText = page.getByPlaceholder("Type another option...");
  await freeText.fill("hola");
  await expect(freeText).toHaveValue("hola");

  await missionCard(page, "Draft the launch email").click();
  await expect(page.getByText("Task: Draft the launch email")).toBeVisible();
  await expect(page.getByText("Which city are you flying to?")).toHaveCount(0);

  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByText("Which city are you flying to?")).toBeVisible();
  await expect(page.getByPlaceholder("Type another option...")).toHaveValue(
    "hola",
  );
});

test("a half-walked card and its draft survive switching to another mission with its own card", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "t1",
            question: "Which city are you flying to?",
            options: [
              { id: "paris", label: "Paris" },
              { id: "tokyo", label: "Tokyo" },
            ],
          },
          {
            kind: "question",
            id: "t2",
            question: "Which week works?",
            options: [
              { id: "next", label: "Next week" },
              { id: "later", label: "Later" },
            ],
          },
        ],
      },
    },
  });

  await page.goto("/");
  await openTeamSection(page, "Tasks");
  await missionCard(page, "Plan a trip to Tokyo").click();
  const tripComposer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(tripComposer).toBeVisible();
  await tripComposer.fill("plan my trip");
  await tripComposer.press("Enter");

  await expect(page.getByText("Which city are you flying to?")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("radio", { name: "Paris" }).click();
  await expect(page.getByText("Which week works?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByPlaceholder("Type another option...").fill("hola");

  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "e1",
            question: "Which mailing list should it go to?",
            options: [
              { id: "all", label: "Everyone" },
              { id: "beta", label: "Beta testers" },
            ],
          },
        ],
      },
    },
  });
  await missionCard(page, "Draft the launch email").click();
  await expect(page.getByText("Task: Draft the launch email")).toBeVisible();
  const emailComposer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(emailComposer).toBeVisible();
  await emailComposer.fill("draft it");
  await emailComposer.press("Enter");

  await expect(
    page.getByText("Which mailing list should it go to?"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Which week works?")).toHaveCount(0);
  await expect(page.getByPlaceholder("Type another option...")).toHaveValue("");

  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByText("Which week works?")).toBeVisible();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await expect(page.getByPlaceholder("Type another option...")).toHaveValue(
    "hola",
  );
});

test("renders the Recommended chip and each option description", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Which sample automation should we design?",
            options: [
              {
                id: "tasks",
                label: "Task tracker",
                description: "Owners, due dates, statuses, and overdue work.",
                recommended: true,
              },
              {
                id: "sales",
                label: "Sales pipeline",
                description: "Leads, stages, follow-ups, and estimated value.",
              },
            ],
          },
        ],
      },
    },
  });

  await startMission(page, "build a spreadsheet");

  await expect(
    page.getByText("Which sample automation should we design?"),
  ).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole("radio", { name: /Task tracker/ })).toBeVisible();
  await expect(
    page.getByText("Owners, due dates, statuses, and overdue work."),
  ).toBeVisible();
  await expect(
    page.getByText("Leads, stages, follow-ups, and estimated value."),
  ).toBeVisible();
  await expect(page.getByText("Recommended")).toHaveCount(1);

  await page.getByRole("radio", { name: /Task tracker/ }).click();
  await expect(
    page.locator(".is-user").filter({ hasText: "Task tracker" }),
  ).toHaveCount(1);
});

test("skips a question from the footer's unified Skip", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q1",
            question: "Anything special I should know about the trip?",
          },
        ],
      },
    },
  });

  await startMission(page, "plan my trip");

  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(
    page.getByText("Anything special I should know about the trip?"),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 15_000,
  });
});

test("pressing Esc declines a lone connect step", async ({ page, request }) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "gmail",
            reason: "I need access to your Gmail to send the trip itinerary.",
          },
        ],
      },
    },
  });

  await startMission(page, "email me the itinerary");

  const reason = page.getByText(
    "I need access to your Gmail to send the trip itinerary.",
  );
  await expect(reason).toBeVisible({ timeout: 15_000 });
  await reason.click();
  await page.keyboard.press("Escape");

  await expect(page.getByText(/Skipped connecting Gmail\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(reason).toHaveCount(0);
});

const ACME_PENDING = {
  slug: "acme_crm",
  name: "Acme CRM",
  kind: "openapi",
  displayUrl: "https://api.acme.test/openapi.json",
  addedAtMs: 0,
  state: {
    status: "pending",
    authMethods: [
      {
        template: "apikey-0",
        label: "API key (X-Api-Key)",
        fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
      },
    ],
  },
  authMethods: [
    {
      template: "apikey-0",
      label: "API key (X-Api-Key)",
      fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
    },
  ],
} as const;

async function armCustomIntegration(
  request: import("@playwright/test").APIRequestContext,
) {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["custom"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
    data: { items: [ACME_PENDING] },
  });
}

function credentialCard(page: import("@playwright/test").Page) {
  return page
    .locator("div.overflow-clip")
    .filter({ hasText: "I need your API key to sync your records." });
}

const credentialStep = {
  kind: "credential",
  id: "k1",
  toolkit: "acme_crm",
  reason: "I need your API key to sync your records.",
} as const;

test("renders the credential card, saves the key, and resumes the agent", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/\d+ of \d+/)).toHaveCount(0);
  const card = credentialCard(page);

  await expect(card.getByText("Acme CRM", { exact: true })).toBeVisible();
  await expect(card.getByText("acme_crm")).toHaveCount(0);
  await expect(
    card.getByText(
      "Paste it below. It is stored securely and never shown in chat.",
    ),
  ).toBeVisible();

  const keyField = page.getByLabel("API key (X-Api-Key)");
  await expect(keyField).toBeVisible();
  await expect(keyField).toHaveAttribute("type", "password");
  await expect(keyField).toHaveAttribute("placeholder", "Paste your key");

  const skip = page.getByRole("button", { name: /Skip/ });
  const save = page.getByRole("button", { name: "Save key" });
  await expect(skip).toBeVisible();
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();

  await keyField.fill("sk_live_acme_42");
  await expect(save).toBeEnabled();
  await save.click();

  await expect(
    page.getByText(/I've added the Acme CRM key\. Please continue\./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("skips the credential step and tells the agent the key was declined", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  const card = credentialCard(page);
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText("Acme CRM", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Skip/ }).click();

  await expect(page.getByText(/Skipped adding the Acme CRM key\./)).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save key" })).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("declines the credential step with a typed instruction and resumes visibly", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [credentialStep] } },
  });

  await startMission(page, "connect the CRM");

  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toBeVisible({ timeout: 15_000 });

  const row = page.getByPlaceholder("Or tell it what to do instead...");
  await expect(row).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);

  await row.fill("read the key from the ACME_KEY environment variable");
  await row.press("Enter");

  const composed = page
    .locator(".is-user")
    .filter({ hasText: "read the key from the ACME_KEY environment variable" });
  await expect(composed).toHaveCount(1, { timeout: 15_000 });
  await expect(composed).toContainText(
    "I didn't add the Acme CRM key. Instead",
  );
  await expect(
    page.getByText("I need your API key to sync your records."),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("a credential step for an unknown integration shows the honest dead-end instead of a doomed form", async ({
  page,
  request,
}) => {
  await armCustomIntegration(request);
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [{ kind: "credential", id: "k1", toolkit: "typeform" }],
      },
    },
  });

  await startMission(page, "connect Typeform");

  await expect(
    page.getByText(/typeform isn't set up yet, so there's nowhere to save/),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Save key" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Paste your key")).toHaveCount(0);

  await page.getByRole("button", { name: /Skip/ }).click();
  await expect(page.getByText(/Skipped adding the typeform key\./)).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("pressing Enter connects a lone connect step", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "connect",
            id: "c1",
            toolkit: "slack",
            reason: "I need Slack access to post the trip summary.",
          },
        ],
      },
    },
  });

  await startMission(page, "post the trip summary");

  const reason = page.getByText(
    "I need Slack access to post the trip summary.",
  );
  await expect(reason).toBeVisible({ timeout: 15_000 });
  await reason.click();
  await page.keyboard.press("Enter");

  await activatePendingConnection(request, "slack");

  await expect(page.getByText(/Connected Slack\./).first()).toBeVisible({
    timeout: 15_000,
  });
});
