import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { startMission } from "./support/mission";

/**
 * PRODUCT-2132: an ask_user question card REPLACES the composer, so it is the
 * only input on screen while the agent waits for a file. The card therefore
 * carries the panel's attachments: its answer row has the composer's "+", shows
 * the attached files as chips (picked, pasted or dropped anywhere on the panel),
 * and the answer ships them in the same message. Before, the card had no attach
 * control and a dropped file hid until a later, separate message.
 */

test.use({ teamBoard: true });

const QUESTION = "Which character are we animating? You can attach its image.";

// A 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function armPhotoQuestion(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-photo",
            question: QUESTION,
            options: [
              { id: "fox", label: "The fox" },
              { id: "owl", label: "The owl" },
            ],
          },
        ],
      },
    },
  });
}

async function openPhotoQuestion(page: Page, request: APIRequestContext) {
  await armPhotoQuestion(request);
  await startMission(page, "animate my character");
  await expect(page.getByText(QUESTION)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);
}

/** The sent user bubble's attachment badge, whose title names the files. */
function sentBadge(page: Page, names: string) {
  return page.locator(`[title="${names}"]`).filter({
    hasText: "1 file attached",
  });
}

test("a question card attaches a picked file and sends it with the chosen option", async ({
  page,
  request,
}) => {
  await openPhotoQuestion(page, request);

  const attach = page.getByRole("button", { name: "Attach files" });
  await expect(attach).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await attach.click();
  await (
    await chooser
  ).setFiles({
    name: "character.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(
    page.getByRole("button", { name: "Remove character.png" }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "The fox" }).click();

  await expect(sentBadge(page, "character.png")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove character.png" }),
  ).toHaveCount(0);
});

test("a file dropped on the panel while the card is up rides the typed answer", async ({
  page,
  request,
}) => {
  await openPhotoQuestion(page, request);

  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const dt = new DataTransfer();
      dt.items.add(
        new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }),
      );
      return dt;
    },
    [...PNG],
  );
  const target = page.getByText(QUESTION);
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });

  await expect(
    page.getByRole("button", { name: "Remove dropped.png" }),
  ).toBeVisible();

  const answer = page.getByPlaceholder("Type another option...");
  await answer.fill("This one, the robot");
  await answer.press("Enter");

  await expect(sentBadge(page, "dropped.png")).toBeVisible({
    timeout: 15_000,
  });
  // Sent with the answer, so nothing is left behind for a later message.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove dropped.png" }),
  ).toHaveCount(0);
});

test("the card's attach control is visible at phone width", async ({
  page,
  request,
}) => {
  await openPhotoQuestion(page, request);
  // Narrowed once the card is up: the board's new-mission door is a desktop
  // control. The phone layout applies live and lands on the task list, so the
  // mission is opened from its row.
  await page.setViewportSize({ width: 412, height: 860 });
  await page
    .getByRole("button", { name: /^animate my character/ })
    .first()
    .click();
  await expect(page.getByText(QUESTION)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Attach files" }),
  ).toBeInViewport();
});

const FILE_QUESTION = "Send me the character's image so I can animate it.";

/** A question the agent marked as answered with a file (`wantsFiles`). */
async function openFileQuestion(page: Page, request: APIRequestContext) {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-upload",
            question: FILE_QUESTION,
            wantsFiles: true,
          },
        ],
      },
    },
  });
  await startMission(page, "animate my character");
  await expect(page.getByText(FILE_QUESTION)).toBeVisible({ timeout: 15_000 });
}

test("a question that wants files leads with an upload area and sends the pick", async ({
  page,
  request,
}) => {
  await openFileQuestion(page, request);

  const upload = page.getByRole("button", { name: "Upload your files" });
  await expect(upload).toBeVisible();
  await expect(page.getByPlaceholder("Or type your answer...")).toBeVisible();
  // The area opens the picker, so the answer row carries no second "+".
  await expect(page.getByRole("button", { name: "Attach files" })).toHaveCount(
    0,
  );

  // The keyboard path: focus the area and press Enter.
  const chooser = page.waitForEvent("filechooser");
  await upload.focus();
  await page.keyboard.press("Enter");
  await (
    await chooser
  ).setFiles({
    name: "character.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(
    page.getByRole("button", { name: "Remove character.png" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(sentBadge(page, "character.png")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("the upload area is visible at phone width", async ({ page, request }) => {
  await openFileQuestion(page, request);
  await page.setViewportSize({ width: 412, height: 860 });
  await page
    .getByRole("button", { name: /^animate my character/ })
    .first()
    .click();
  await expect(page.getByText(FILE_QUESTION)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Upload your files" }),
  ).toBeInViewport();
  await expect(
    page.getByPlaceholder("Or type your answer..."),
  ).toBeInViewport();
});

test("each file question in one card is answered by its own file", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/chat-interaction`, {
    data: {
      interaction: {
        steps: [
          {
            kind: "question",
            id: "q-logo",
            question: "Your logo?",
            wantsFiles: true,
          },
          {
            kind: "question",
            id: "q-photo",
            question: "A product photo?",
            wantsFiles: true,
          },
        ],
      },
    },
  });
  await startMission(page, "make my product page");
  await expect(page.getByText("Your logo?")).toBeVisible({ timeout: 15_000 });

  const pick = async (name: string) => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload your files" }).click();
    await (
      await chooser
    ).setFiles({
      name,
      mimeType: "image/png",
      buffer: PNG,
    });
  };
  const send = page.getByRole("button", { name: "Send", exact: true });

  await pick("logo.png");
  await send.click();
  await expect(page.getByText("A product photo?")).toBeVisible();
  // The logo answered the first question, so it is not this one's answer.
  await expect(
    page.getByRole("button", { name: "Remove logo.png" }),
  ).toHaveCount(0);
  await expect(send).toBeDisabled();

  await pick("photo.png");
  await expect(
    page.getByRole("button", { name: "Remove photo.png" }),
  ).toBeVisible();
  await send.click();
  await expect(page.getByText("2 files attached")).toBeVisible({
    timeout: 15_000,
  });
});
