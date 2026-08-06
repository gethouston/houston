import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
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

/**
 * Rewrite every persisted query's `dataUpdatedAt` to `agedAt` — the mirror a
 * user who closed the app yesterday restores from. Returns how many entries
 * were aged.
 */
function ageQueryMirror(page: Page, agedAt: number): Promise<number> {
  return page.evaluate(
    (at: number) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("houston-query-cache", 1);
        open.onsuccess = () => {
          const store = open.result
            .transaction("kv", "readwrite")
            .objectStore("kv");
          const get = store.get("houston.list-queries");
          get.onsuccess = () => {
            const parsed = JSON.parse(get.result as string) as {
              clientState: { queries: { state: { dataUpdatedAt: number } }[] };
            };
            for (const query of parsed.clientState.queries)
              query.state.dataUpdatedAt = at;
            const put = store.put(
              JSON.stringify(parsed),
              "houston.list-queries",
            );
            put.onsuccess = () => resolve(parsed.clientState.queries.length);
            put.onerror = () => reject(put.error);
          };
          get.onerror = () => reject(get.error);
        };
        open.onerror = () => reject(open.error);
      }),
    agedAt,
  );
}

/** The freshest `dataUpdatedAt` in the persisted mirror, or -1 with no mirror. */
function newestMirrorUpdatedAt(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("houston-query-cache", 1);
        open.onsuccess = () => {
          const request = open.result
            .transaction("kv", "readonly")
            .objectStore("kv")
            .get("houston.list-queries");
          request.onsuccess = () => {
            try {
              const parsed = JSON.parse(request.result as string) as {
                clientState: {
                  queries: { state: { dataUpdatedAt: number } }[];
                };
              };
              resolve(
                Math.max(
                  -1,
                  ...parsed.clientState.queries.map(
                    (q) => q.state.dataUpdatedAt,
                  ),
                ),
              );
            } catch {
              resolve(-1);
            }
          };
          request.onerror = () => resolve(-1);
        };
        open.onerror = () => resolve(-1);
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
    data: { ms: 20_000 },
  });
  await page.reload();

  // The cards must come from the locally cached aggregate — well before any
  // held read can answer. The grace only has to stay far under the hold to
  // keep the proof sharp; it must ALSO absorb a full dev-server reload on a
  // contended CI runner, which alone can blow a too-tight budget (a 4s grace
  // under an 8s hold flaked there). 12s of grace, 20s hold: same invariant,
  // CI-realistic slack. On success the assertion resolves at paint time, so
  // the bigger numbers cost nothing.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible({
    timeout: 12_000,
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

/**
 * Clicks on app chrome (sidebar, titlebar, toolbar) must NOT dismiss an open
 * chat — only an explicit close (the X, Escape, delete, agent switch) does.
 * The board once closed the panel on any outside pointerdown; a stray click
 * anywhere silently dropped the conversation the user was reading.
 */
test("keeps the open chat when clicking app chrome outside the panel", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Plan a trip to Tokyo").click();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();

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

/**
 * The Done card's counterpart to the checkmark (act-2 = the seeded `done`
 * mission): one click writes status=archived, which takes the mission off the
 * active board entirely and surfaces it behind the Activity Archived button.
 */
test("archives a Done mission from its card", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-2"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Archive" }).click();

  // Off the active board, and found again in the archived list.
  await expect(page.getByText("Draft the launch email")).toHaveCount(0);
  await page.getByRole("button", { name: "Archived" }).click();
  await expect(page.getByText("Draft the launch email")).toBeVisible();
});

/** The archive box belongs to the Done column alone: a mission still waiting on
 *  the user gets the checkmark instead, so nothing can be filed away unread. */
test("offers no archive box on a Needs-you card", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await expect(
    card.getByRole("button", { name: "Move to done" }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: "Archive" })).toHaveCount(0);
});

/**
 * HOU-932: the card wrapper's Enter/Space handler had no target guard, so a
 * Space bubbling out of the inline rename input was preventDefault-ed and
 * opened the mission — the editor unmounted mid-word and the space never
 * landed. Renaming to a MULTI-WORD title is the whole regression.
 */
test("renames a mission to a multi-word title without the space closing the editor", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await card.getByRole("button", { name: "Change title" }).click();

  // Type char-by-char (a `fill` would set the value in one shot and never
  // deliver the Space keydown this guards).
  const input = card.getByRole("textbox");
  await expect(input).toHaveValue("Plan a trip to Tokyo");
  await input.fill("");
  await input.pressSequentially("Two words");

  // The editor survived the space with the whole string intact, and the
  // mission's chat never opened behind it.
  await expect(input).toHaveValue("Two words");
  await expect(page.getByPlaceholder("Send a follow-up...")).toHaveCount(0);

  await input.press("Enter");
  await expect(card.getByText("Two words")).toBeVisible();
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

/** Cross-agent Mission Control (the aggregate's own surface). */
async function openMissionControl(page: Page): Promise<void> {
  await page.locator("[data-tour-target='nav-dashboard']").click();
}

/**
 * HOU-981, the half-broken fleet. The cross-agent sweep is one read per agent;
 * it used to run under `Promise.all`, so ONE unreachable pod rejected the whole
 * aggregate — and since React Query's placeholder covers the pending state
 * only, Mission Control rendered an EMPTY board (and auto-opened the composer
 * over it) while every healthy agent's missions sat right there in cache.
 *
 * The healthy agents' missions must survive one sick agent, always.
 */
test("keeps the healthy agents' missions when one agent's reads fail", async ({
  page,
  request,
}) => {
  const created = await request.post(`${FAKE_HOST_URL}/agents`, {
    data: { name: "Kai" },
  });
  const broken = (await created.json()) as { id: string };
  await request.post(`${FAKE_HOST_URL}/agents/${broken.id}/activities`, {
    data: { title: "Ship the payroll run", status: "needs_you" },
  });
  // That agent's pod is unreachable; every other agent answers normally.
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [broken.id] },
  });

  await page.goto("/");
  await openMissionControl(page);

  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();
  // HOU-1245 retired the generic error-toast pair, and this notice rode it: an
  // incomplete sweep now recovers QUIETLY. The recovery itself is unchanged and
  // still covered — `stepSweepRecovery` schedules the bounded re-sweep, unit
  // tested in app/tests/all-conversations-recovery.test.ts — and the sweep's
  // Sentry capture plus `app_error_shown` event are untouched, so WE still see
  // it even though the user no longer does. What this asserts is only that the
  // healthy agents' missions never depended on the toast.
  await expect(
    page.getByText("Some missions could not load. We are trying again."),
  ).toHaveCount(0);
});

/**
 * HOU-981, the frozen-restore bug itself: "missions are sometimes not there
 * when I log in".
 *
 * The aggregate is restored from IndexedDB carrying its ORIGINAL
 * `dataUpdatedAt`, and it used to be `staleTime: Infinity` — so a restored copy
 * was permanently fresh and NOTHING revalidated it for the whole session. Every
 * mission created while the app was closed (an overnight routine, a teammate,
 * another device) stayed invisible.
 *
 * Model: persist a board, age the mirror to yesterday, create a mission while
 * the app cannot hear about it, reload. The restored cards must paint AND the
 * boot sweep must bring the new mission in.
 *
 * The reactivity stream is cut for the whole test on purpose. It is what makes
 * the assertion mean something: with `/v1/events` dead, a push event can never
 * deliver the new mission, so the ONLY thing that can put it on the board is a
 * fresh read of the restored aggregate.
 */
test("re-reads the restored board on boot so missions created offline appear", async ({
  page,
  request,
}) => {
  await seedUserScopedToken(page);
  await page.route("**/v1/events*", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  await expect
    .poll(async () => (await persistedMirrorHeads(page)) ?? [], {
      timeout: 15_000,
    })
    .toContain("all-conversations");

  // Age every persisted entry to yesterday — the state a user who closes the
  // app at night and signs in the next morning actually restores. Re-applied
  // until it sticks: the persister writes on a throttle, so a write queued
  // before this can land after it and reset the clock.
  const agedAt = Date.now() - 24 * 60 * 60 * 1_000;
  await expect
    .poll(async () => {
      await ageQueryMirror(page, agedAt);
      return await newestMirrorUpdatedAt(page);
    })
    .toBe(agedAt);

  // The overnight routine's mission: written while the app was closed, so no
  // event ever reached this client.
  const written = await request.post(
    `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`,
    { data: { title: "Overnight expense report", status: "needs_you" } },
  );
  expect(written.ok()).toBe(true);

  await page.reload();
  await openMissionControl(page);

  // Yesterday's board is still there...
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  // ...and the boot sweep brought in what happened while we were away.
  await expect(page.getByText("Overnight expense report")).toBeVisible();
});
