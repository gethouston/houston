import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

const AGENT = "houston-assistant";
const PARENT_ID = "parent-1";
const PARENT_CONVERSATION = `activity-${PARENT_ID}`;

async function seedFanOut(request: {
  post: (url: string, opts: { data: unknown }) => Promise<unknown>;
}) {
  const activities = `${FAKE_HOST_URL}/agents/${AGENT}/activities`;
  await request.post(activities, {
    data: { id: PARENT_ID, title: "Plan the launch", status: "needs_you" },
  });
  await request.post(activities, {
    data: {
      id: "child-running",
      title: "Checking emails",
      status: "running",
      origin_session_key: PARENT_CONVERSATION,
    },
  });
  await request.post(activities, {
    data: {
      id: "child-done",
      title: "Read excel",
      status: "done",
      origin_session_key: PARENT_CONVERSATION,
    },
  });
  await request.post(activities, {
    data: { id: "unrelated", title: "Unrelated errand", status: "running" },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: PARENT_CONVERSATION,
      messages: [
        { role: "user", content: "lanza dos misiones", ts: 1 },
        { role: "assistant", content: "Listo, lancé dos misiones.", ts: 2 },
      ],
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: "activity-child-running",
      messages: [{ role: "user", content: "revisa el correo", ts: 1 }],
    },
  });
}

test("a chat lists the missions it started, and opening one goes there (PRODUCT-1244)", async ({
  page,
  request,
}) => {
  await seedFanOut(request);
  await page.goto("/");
  await page.getByText("Plan the launch").first().click();

  const list = page.getByRole("list", { name: /missions started here/i });
  await expect(
    list.getByRole("button", { name: /Checking emails/ }),
  ).toHaveText(/Running/);
  await expect(list.getByRole("button", { name: /Read excel/ })).toHaveText(
    /Done/,
  );
  await expect(
    list.getByRole("button", { name: /Unrelated errand/ }),
  ).toHaveCount(0);
  const titles = await list.getByRole("button").allInnerTexts();
  expect(titles[0]).toContain("Checking emails");

  const toggle = page.getByRole("button", {
    name: /missions started here 2/i,
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    list.getByRole("button", { name: /Checking emails/ }),
  ).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await list.getByRole("button", { name: /Checking emails/ }).click();
  await expect(page.getByText("Task: Checking emails")).toBeVisible();
  await expect(page.getByText("revisa el correo")).toBeVisible();

  const backLink = page.getByRole("button", {
    name: /go to main mission Plan the launch/i,
  });
  await backLink.click();
  await expect(page.getByText("Task: Plan the launch")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /missions started here 2/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /go to main mission/i }),
  ).toHaveCount(0);
});

test("a chat with no children keeps the ordinary composer (PRODUCT-1244)", async ({
  page,
  request,
}) => {
  await seedFanOut(request);
  await page.goto("/");
  await page.getByText("Unrelated errand").first().click();
  await expect(
    page.getByRole("list", { name: /missions started here/i }),
  ).toHaveCount(0);
});
