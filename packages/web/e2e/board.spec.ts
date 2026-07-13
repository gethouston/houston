import { expect, test } from "./support/fixtures";

/**
 * The mission board is "files-first": it reads `.houston/activity/activity.json`
 * (served by the fake host's agentfile store) and groups missions into columns by
 * status. These specs prove that data path and card → chat navigation.
 */
test("renders the seeded missions on the board", async ({ page }) => {
  await page.goto("/");

  // Seeded in state.ts: one "needs_you" mission, one "done" mission.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();
});

test("restores cached missions before starting fresh board reads", async ({
  page,
}) => {
  // The standard fake-host token is deliberately non-user-scoped, which turns
  // persistence off. Give this test a JWT-shaped per-user token; the fake host
  // accepts it, while the cache correctly scopes itself to `e2e-user`.
  await page.addInitScript(() => {
    const key = "houston.web.engine.new";
    const config = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(
      key,
      JSON.stringify({
        ...config,
        token: "e30.eyJzdWIiOiJlMmUtdXNlciJ9.sig",
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Let the async persister commit this populated board, then make its next
  // IndexedDB read visibly slow. This pins the startup race: no activity read
  // may start while the older, populated cache is still being restored.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("houston-query-cache", 1);
        open.onsuccess = () => {
          const request = open.result
            .transaction("kv", "readonly")
            .objectStore("kv")
            .get("houston.list-queries");
          request.onsuccess = () => resolve(typeof request.result === "string");
          request.onerror = () => resolve(false);
        };
        open.onerror = () => resolve(false);
      }),
  );
  await page.addInitScript(() => {
    const nativeGet = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function delayedGet(query) {
      const nativeRequest = nativeGet.call(this, query);
      const delayedRequest = {
        error: null as DOMException | null,
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        get result() {
          return nativeRequest.result;
        },
      } as IDBRequest;
      (
        window as typeof window & { __queryRestoreStarted?: boolean }
      ).__queryRestoreStarted = true;
      nativeRequest.addEventListener("success", (event) => {
        setTimeout(() => delayedRequest.onsuccess?.(event), 500);
      });
      nativeRequest.addEventListener("error", (event) => {
        setTimeout(() => delayedRequest.onerror?.(event), 500);
      });
      return delayedRequest;
    };
  });

  let activityReads = 0;
  await page.route("**/agents/*/activities", async (route) => {
    if (route.request().method() === "GET") activityReads += 1;
    await route.continue();
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __queryRestoreStarted?: boolean })
        .__queryRestoreStarted === true,
  );
  await page.waitForTimeout(100);

  expect(activityReads).toBe(0);
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
});

test("opens a mission's chat when its card is clicked", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").click();

  // The mission's conversation opens (an existing mission uses the follow-up
  // composer; a brand-new conversation uses "What should the agent work on?").
  await expect(page.getByText("Mission: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});

/** The "Search missions" box filters the board client-side. */
test("filters the board with the search box", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();

  await page.getByPlaceholder("Search missions").fill("Tokyo");

  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toHaveCount(0);
});

/**
 * Card actions are hover-gated. Cards carry `data-kanban-card="<id>"` and columns
 * `data-kanban-column="<status>"` (act-1 = the needs_you Tokyo mission), so we can
 * scope precisely. "Move to done" writes status=done to activity.json, which the
 * board re-reads and re-columns.
 */
test("moves a mission to the Done column", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();

  // The card now lives under the Done column.
  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("Plan a trip to Tokyo"),
  ).toBeVisible();
});

test("deletes a mission from the board", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-2"]'); // "Draft the launch email"
  await card.hover();
  await card.getByRole("button", { name: "Delete" }).click();

  // Confirm in the alert dialog ("Delete \"Draft the launch email\"?").
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page.getByText("Draft the launch email")).toHaveCount(0);
});
