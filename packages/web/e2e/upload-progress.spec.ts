import { mkdir } from "node:fs/promises";
import type { Route } from "@playwright/test";
import { BOOT_TIMEOUT } from "./config";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import { awaitAgentsHome, openPhoneTeamSection } from "./support/mobile-nav";
import { missionCard, openTeamSection } from "./support/team-nav";

const SHOTS = "/private/tmp/claude-501/upload-design/shots";
const SIZE = 20 * 1024 * 1024;
const SECOND_CHUNK = `bytes ${8 * 1024 * 1024}-`;
const THIRD_CHUNK = `bytes ${16 * 1024 * 1024}-`;

test.beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
});

for (const [layout, viewport] of [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] satisfies Array<[string, { width: number; height: number }]>) {
  test.describe(layout, () => {
    test.use({ viewport });

    test("composer shows per-file progress and resumes a dropped chunk", async ({
      page,
    }) => {
      await page.goto("/");
      if (layout === "phone") {
        await (await awaitAgentsHome(page)).click();
        await page
          .getByTestId("agent-missions-screen")
          .getByText("Plan a trip to Tokyo")
          .click();
      } else {
        await openTeamSection(page, "Tasks");
        await missionCard(page, "Plan a trip to Tokyo").click();
      }
      const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
      await expect(composer).toBeVisible({ timeout: BOOT_TIMEOUT });

      let holdChunk!: (route: Route) => void;
      const secondChunk = new Promise<Route>((resolve) => {
        holdChunk = resolve;
      });
      let holdQuery!: (route: Route) => void;
      const statusQuery = new Promise<Route>((resolve) => {
        holdQuery = resolve;
      });
      let droppedChunks = 0;
      await page.route("**/v1/uploads/**", async (route) => {
        const request = route.request();
        const range = request.headers()["content-range"] ?? "";
        if (request.method() === "PUT" && range.startsWith(SECOND_CHUNK)) {
          holdChunk(route);
        } else if (
          request.method() === "PUT" &&
          range.startsWith(THIRD_CHUNK) &&
          droppedChunks === 0
        ) {
          droppedChunks += 1;
          await route.abort("connectionreset");
        } else if (request.method() === "PUT" && range === `bytes */${SIZE}`) {
          holdQuery(route);
        } else {
          await route.continue();
        }
      });

      await page
        .locator('input[type="file"][multiple]:not([webkitdirectory])')
        .setInputFiles([
          {
            name: "notes.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("Notes"),
          },
          {
            name: "video.mp4",
            mimeType: "video/mp4",
            buffer: Buffer.alloc(SIZE, 1),
          },
        ]);
      const largeChip = page
        .getByRole("button", { name: "Remove video.mp4", exact: true })
        .locator("..");
      const smallChip = page
        .getByRole("button", { name: "Remove notes.txt", exact: true })
        .locator("..");
      await expect(largeChip).toBeVisible();
      await composer.fill("Review these attachments");
      await composer.press("Enter");

      const chunk = await secondChunk;
      await expect(largeChip).toContainText(/Uploading… \d+%/);
      const progress = largeChip.getByRole("progressbar", {
        name: "video.mp4",
        exact: true,
      });
      await expect(progress).toBeVisible();
      const percent = Number(await progress.getAttribute("aria-valuenow"));
      expect(percent).toBeGreaterThan(0);
      expect(percent).toBeLessThan(100);
      await expect(smallChip).toContainText("All done");
      await page.screenshot({
        path: `${SHOTS}/composer-uploading-${layout}.png`,
      });
      await chunk.continue();

      const query = await statusQuery;
      await expect(largeChip.getByRole("status")).toHaveText("Reconnecting…");
      await page.screenshot({
        path: `${SHOTS}/composer-reconnecting-${layout}.png`,
      });
      await query.continue();

      await expect(
        page.getByText("Review these attachments", { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[title="notes.txt, video.mp4"]')).toHaveText(
        "2 files attached",
      );
      await expect(page.getByText(/Roger that\. You said:/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Remove (notes\.txt|video\.mp4)$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("progressbar", { name: "video.mp4", exact: true }),
      ).toHaveCount(0);
      expect(droppedChunks).toBe(1);
    });

    test("Files picker shows upload progress before the file joins the listing", async ({
      page,
    }) => {
      await page.goto("/");
      if (layout === "phone")
        await openPhoneTeamSection(page, "files", "click");
      else await openTeamSection(page, "Files");
      await expect(
        page.getByRole("row").filter({ hasText: "Q3 report.pdf" }),
      ).toBeVisible({ timeout: BOOT_TIMEOUT });

      let holdChunk!: (route: Route) => void;
      const secondChunk = new Promise<Route>((resolve) => {
        holdChunk = resolve;
      });
      await page.route("**/v1/uploads/**", async (route) => {
        if (
          route.request().method() === "PUT" &&
          route.request().headers()["content-range"]?.startsWith(SECOND_CHUNK)
        )
          holdChunk(route);
        else await route.continue();
      });

      await page.getByRole("button", { name: "New", exact: true }).click();
      const chooser = page.waitForEvent("filechooser");
      await page
        .getByRole("menuitem", { name: "Upload files", exact: true })
        .click();
      await (await chooser).setFiles({
        name: "recording.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.alloc(SIZE, 2),
      });

      const chunk = await secondChunk;
      const progress = page.getByRole("progressbar", {
        name: "recording.mp4",
        exact: true,
      });
      const uploadRow = page
        .locator("div")
        .filter({ has: progress })
        .filter({ has: page.getByText("20 MB", { exact: true }) })
        .last();
      await expect(uploadRow).toContainText("recording.mp4");
      await expect(uploadRow).toContainText("20 MB");
      await expect(uploadRow).toContainText(/Uploading… \d+%/);
      await expect(progress).toBeVisible();
      const percent = Number(await progress.getAttribute("aria-valuenow"));
      expect(percent).toBeGreaterThan(0);
      expect(percent).toBeLessThan(100);
      await page.screenshot({ path: `${SHOTS}/files-uploading-${layout}.png` });
      await chunk.continue();

      await expect(
        page.getByRole("row").filter({ hasText: "recording.mp4" }),
      ).toBeVisible();
      await expect(progress).toHaveCount(0);
    });
  });
}
