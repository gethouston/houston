import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import {
  PDF_FILE as FILE,
  PDF_MISSION_TITLE,
  seedChatWithPdf,
} from "./support/pdf-chat";
import { seedSidebarLayout } from "./support/sidebar-layout";
import { openTeamSection } from "./support/team-nav";

async function drawArea(page: Page) {
  const sheet = page.locator(".pdf-page").first();
  await expect(sheet.locator("canvas")).toBeVisible();
  const box = await sheet.boundingBox();
  if (!box) throw new Error("the page has no box");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.75, {
    steps: 8,
  });
  await page.mouse.up();
}

test("a comment on a page rides the next send with its crop (HOU-192)", async ({
  page,
  request,
}) => {
  await seedChatWithPdf(request);
  await page.goto("/");
  await page.getByText(PDF_MISSION_TITLE).first().click();
  await page.getByRole("button", { name: "plan.pdf" }).click();

  const panel = page.getByRole("region", { name: `Preview of ${FILE}` });
  await expect(panel.getByText("1 / 1")).toBeVisible();
  await drawArea(page);

  const editor = page.getByRole("textbox", {
    name: "What should the agent change?",
  });
  await expect(editor).toBeFocused();
  await editor.fill("Make the chart bigger");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const chips = page.getByRole("region", { name: "Comments for the agent" });
  await expect(
    chips.getByRole("button", {
      name: "Comment 1 on Page 1: Make the chart bigger",
    }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /^Comment 1:/ }),
  ).toBeVisible();

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Open Page 1: Make the chart bigger" }),
  ).toBeVisible();
  await expect(chips).toBeHidden();
  await expect(panel.getByRole("button", { name: /^Comment 1:/ })).toHaveCount(
    0,
  );

  const listing = await request.get(
    `${FAKE_HOST_URL}/agents/houston-assistant/files`,
  );
  const files = (await listing.json()) as { path: string }[];
  expect(files.map((f) => f.path)).toContainEqual(
    expect.stringMatching(/^uploads\/plan-page1-[a-z0-9]{6}\.png$/),
  );
});

test("opened from the Files tab, the preview takes no comments and says why (HOU-192)", async ({
  page,
  request,
}) => {
  await seedChatWithPdf(request);
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as { id: string }[];
  await seedSidebarLayout(request, {
    groups: [
      {
        id: "files-team",
        name: "Files",
        collapsed: false,
        agentIds: agents.map((agent) => agent.id),
      },
    ],
    order: [],
  });
  await page.goto("/");
  await openTeamSection(page, "Files");
  await page.getByRole("row").filter({ hasText: FILE }).getByText(FILE).click();

  const panel = page.getByRole("region", { name: `Preview of ${FILE}` });
  await expect(
    panel.getByText("To comment for the agent, open this file from a chat"),
  ).toBeVisible();
  await drawArea(page);
  await expect(
    page.getByRole("textbox", { name: "What should the agent change?" }),
  ).toHaveCount(0);
});
