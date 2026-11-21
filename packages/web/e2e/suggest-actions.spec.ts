import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { closeActivityPanel } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";

const missionCard = (page: Page, title: string) =>
  page.locator("[data-kanban-card]").filter({ hasText: title });

const BOTH_OFFERS = {
  interaction: {
    steps: [
      {
        kind: "suggest_actions",
        id: "a1",
        actions: [
          { id: "draft", label: "Draft an email", message: "Draft the email." },
          { id: "share", label: "Share update", message: "Share the update." },
        ],
      },
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly update",
        rationale: "You will want this same update again next week.",
      },
    ],
  },
};

test("suggested actions keep the latest reply visible in every frame", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-reply`, {
    data: {
      text: `Roger that. You said: prepare the update.\n\n${Array.from(
        { length: 24 },
        (_, index) =>
          `Update ${index + 1}. The weekly report is ready to review.`,
      ).join("\n\n")}`,
    },
  });
  await startMission(page, "prepare the update");
  const pane = page.locator(".conversation-scroll-pane");
  await expect
    .poll(() =>
      pane.evaluate((element) => ({
        overflowing: element.scrollHeight > element.clientHeight,
        pinned:
          element.scrollHeight - element.clientHeight - element.scrollTop < 2,
      })),
    )
    .toEqual({ overflowing: true, pinned: true });

  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: { interaction: { steps: [BOTH_OFFERS.interaction.steps[0]] } },
  });
  const slotGate = await page.addStyleTag({
    content:
      '.shrink-0:has(> div [aria-label="Dismiss suggested actions"]) { display: none; }',
  });
  const probe = await pane.evaluateHandle((element) => {
    const samples: {
      replyBottom: number;
      paneBottom: number;
    }[] = [];
    const initialHeight = element.clientHeight;
    let frame = 0;
    let task = 0;
    let reportedHeight = 0;
    const observer = new ResizeObserver(() => {
      reportedHeight = element.clientHeight;
    });
    observer.observe(element);
    const sample = () => {
      if (document.querySelector('[aria-label="Dismiss suggested actions"]')) {
        if (
          element.clientHeight === reportedHeight &&
          reportedHeight < initialHeight
        ) {
          const rows = element.querySelectorAll(
            "[data-conversation-message-key]",
          );
          const reply = rows.item(rows.length - 1);
          samples.push({
            replyBottom: reply.getBoundingClientRect().bottom,
            paneBottom:
              element.getBoundingClientRect().top + element.clientHeight,
          });
        }
      }
      frame = requestAnimationFrame(() => {
        task = window.setTimeout(sample, 0);
      });
    };
    frame = requestAnimationFrame(() => {
      task = window.setTimeout(sample, 0);
    });
    return {
      samples,
      stop() {
        cancelAnimationFrame(frame);
        clearTimeout(task);
        observer.disconnect();
        return samples;
      },
    };
  });
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await composer.fill("finish the update");
  await composer.press("Enter");
  await expect(
    page.getByRole("button", { name: "Draft an email", includeHidden: true }),
  ).toBeAttached();
  await expect
    .poll(() =>
      pane.evaluate(
        (element) =>
          element.scrollHeight - element.clientHeight - element.scrollTop < 2,
      ),
    )
    .toBe(true);
  await slotGate.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect
    .poll(() => probe.evaluate(({ samples }) => samples.length))
    .toBeGreaterThanOrEqual(3);
  const samples = await probe.evaluate((handle) => handle.stop());
  await probe.dispose();
  expect(
    samples.filter(
      ({ replyBottom, paneBottom }) => replyBottom > paneBottom + 2,
    ),
    "the latest reply must remain above the composer's visible edge",
  ).toEqual([]);
});

test("suggested action pills settle the card in Needs you, prefill the composer, and dismiss", async ({
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
  await startMission(page, "prepare the update");
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-kanban-column="needs_you"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-kanban-column="done"]').getByText("prepare the update"),
  ).toHaveCount(0);
  const followUp = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(followUp).toBeVisible();
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Share update" }).click();
  await expect(followUp).toHaveValue("Share the update.");
  await page.getByRole("button", { name: "Draft an email" }).click();
  await expect(followUp).toHaveValue("Draft the email.");
  await followUp.press("Enter");
  await expect(
    page.locator(".is-user").filter({ hasText: "Draft the email." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share update", exact: true }),
  ).toHaveCount(0);
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
  await page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER).fill("again");
  await page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER).press("Enter");
  await expect(
    page.getByRole("button", { name: "Dismiss suggested actions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss suggested actions" }).click();
  await expect(
    page.getByRole("button", { name: "One", exact: true }),
  ).toHaveCount(0);
});

test("the user's move to Done keeps the finished mission's offers", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: BOTH_OFFERS,
  });
  await startMission(page, "prepare the update");

  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(page.getByText("Save this for next time")).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
  await expect(
    page
      .locator('[data-kanban-column="needs_you"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();

  await closeActivityPanel(page);
  const card = missionCard(page, "prepare the update");
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("prepare the update")
      .first(),
  ).toBeVisible();

  await card.click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Save this for next time")).toBeVisible();

  await page.reload();
  await missionCard(page, "prepare the update").click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Save this for next time")).toBeVisible();
});

test("the user's move to Done retires a blocking question, live", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          { kind: "question", id: "q1", question: "Which deck should I send?" },
        ],
      },
    },
  });
  await startMission(page, "send the deck");
  await expect(page.getByPlaceholder("Type your answer...")).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByPlaceholder("Type your answer...")).toBeHidden();
  const card = missionCard(page, "send the deck");
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("send the deck")
      .first(),
  ).toBeVisible();

  await card.click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByPlaceholder("Type your answer...")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Collapse interaction" }),
  ).toHaveCount(0);
});

test("dismissing one offer keeps its sibling, through a reload", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: BOTH_OFFERS,
  });
  await startMission(page, "prepare the update");

  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toBeVisible();
  await expect(page.getByText("Save this for next time")).toBeVisible();

  await page.getByRole("button", { name: "Dismiss suggested actions" }).click();
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toHaveCount(0);
  await expect(page.getByText("Save this for next time")).toBeVisible();

  await page.reload();
  await missionCard(page, "prepare the update").click();
  await expect(page.getByText("Save this for next time")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Draft an email" }),
  ).toHaveCount(0);
});
