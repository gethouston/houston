import { FAKE_HOST_URL } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The persisted query mirror's query-key heads, or null while no mirror
 * exists. Read via `page.evaluate`, which awaits the returned Promise —
 * `page.waitForFunction` does NOT (a pending Promise object is truthy), so a
 * wait built on it resolves instantly and asserts nothing.
 */
function persistedMirrorHeads(page: Page): Promise<string[] | null> {
  return page.evaluate(
    () =>
      new Promise<string[] | null>((resolve) => {
        const open = indexedDB.open("houston-query-cache", 1);
        open.onsuccess = () => {
          const request = open.result
            .transaction("kv", "readonly")
            .objectStore("kv")
            .get("houston.list-queries");
          request.onsuccess = () => {
            try {
              const raw = request.result as string | undefined;
              if (typeof raw !== "string") return resolve(null);
              const parsed = JSON.parse(raw) as {
                clientState: { queries: { queryKey: unknown[] }[] };
              };
              resolve(
                parsed.clientState.queries.map((q) => String(q.queryKey[0])),
              );
            } catch {
              resolve(null);
            }
          };
          request.onerror = () => resolve(null);
        };
        open.onerror = () => resolve(null);
      }),
  );
}

/** Give the page a JWT-shaped per-user token: the fake host accepts any
 *  bearer, while the query/transcript caches scope themselves to `e2e-user`
 *  (the standard non-JWT token deliberately turns persistence off). */
async function seedUserScopedToken(page: Page): Promise<void> {
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
}

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
  await seedUserScopedToken(page);
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Let the async persister commit this populated board (the write throttle
  // lags the fetch by a second or more — wait for the CONTENT, not just the
  // store), then make its next IndexedDB read visibly slow. This pins the
  // startup race: no activity read may start while the older, populated cache
  // is still being restored.
  await expect
    .poll(async () => (await persistedMirrorHeads(page)) ?? [], {
      timeout: 15_000,
    })
    .toContain("activity");
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

/**
 * The cold-open reality check: on a real cloud boot every per-agent read
 * hangs behind the gateway for the whole pod wake (~seconds), so the ONLY
 * thing that can paint the board immediately is what's cached locally. The
 * restore test above can't prove that — its live read answers instantly and
 * would paint the card even if the restored data never reached the board.
 *
 * This models the exact production failure: the per-agent `["activity", X]`
 * mirror entry is MISSING (it only lands when a session with X's board open
 * outlives the pod wake plus the persist throttle), while the aggregate the
 * sidebar badges paint from is present (it's swept every session). The board
 * must seed its cards from that aggregate instead of showing empty columns
 * for the whole wake — the badge says 2 missions, the columns must agree.
 */
test("paints cached missions immediately while cold-start reads are held", async ({
  page,
  request,
}) => {
  await seedUserScopedToken(page);
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  // Let the async persister commit both list surfaces to IndexedDB.
  await expect
    .poll(
      async () => {
        const heads = (await persistedMirrorHeads(page)) ?? [];
        return (
          heads.includes("activity") && heads.includes("all-conversations")
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // Drop the per-agent board entries, keeping the aggregate — the mirror a
  // real cold open typically finds. The app is idle here (no cache events →
  // no persister rewrites), so the strip sticks until the reload.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("houston-query-cache", 1);
        open.onsuccess = () => {
          const store = open.result
            .transaction("kv", "readwrite")
            .objectStore("kv");
          const get = store.get("houston.list-queries");
          get.onsuccess = () => {
            const parsed = JSON.parse(get.result as string) as {
              clientState: { queries: { queryKey: unknown[] }[] };
            };
            parsed.clientState.queries = parsed.clientState.queries.filter(
              (q) => q.queryKey[0] !== "activity",
            );
            const put = store.put(
              JSON.stringify(parsed),
              "houston.list-queries",
            );
            put.onsuccess = () => resolve();
            put.onerror = () => reject(put.error);
          };
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  const stripped = (await persistedMirrorHeads(page)) ?? [];
  expect(stripped).toContain("all-conversations");
  expect(stripped).not.toContain("activity");

  // Cold open: every per-agent read now stalls the way an asleep pod's do.
  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms: 8_000 },
  });
  await page.reload();

  // The cards must come from the locally cached aggregate — well before any
  // held read can answer. 4s of grace for the reload+restore, far under the
  // 8s hold.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible({
    timeout: 4_000,
  });
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
