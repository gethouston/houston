import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./support/composer";
import { expect, test } from "./support/fixtures";
import {
  ARCHIVED_HOUSTON_MISSION,
  ORIGIN_MISSIONS,
  seedOriginMissions,
} from "./support/origin-missions";
import { seedSidebarLayout } from "./support/sidebar-layout";
import {
  missionCard,
  openArchivedTasks,
  openTeamSection,
  screen,
} from "./support/team-nav";

test.beforeEach(async ({ request }) => {
  await seedSidebarLayout(request, {
    groups: [
      {
        id: "board-team",
        name: "Operations",
        collapsed: false,
        agentIds: [SEED_AGENT_ID],
      },
    ],
    order: [],
  });
});

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

const RESTORE_HOLD_MS = 4_000;

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

test("renders the seeded missions on the board", async ({ page }) => {
  await page.goto("/");

  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(missionCard(page, "Draft the launch email")).toBeVisible();
});

test("tags each mission card with who started it", async ({
  page,
  request,
}) => {
  await seedOriginMissions(request);
  await page.goto("/");

  for (const mission of ORIGIN_MISSIONS) {
    await expect(
      page
        .locator(`[data-kanban-card="${mission.id}"]`)
        .getByText(mission.tag, {
          exact: true,
        }),
    ).toBeVisible();
  }
  const own = page.locator('[data-kanban-card="act-1"]');
  await expect(own).toBeVisible();
  for (const tag of new Set(ORIGIN_MISSIONS.map((m) => m.tag)))
    await expect(own.getByText(tag, { exact: true })).toHaveCount(0);
  await expect(missionCard(page, ARCHIVED_HOUSTON_MISSION.title)).toHaveCount(
    0,
  );
  await openArchivedTasks(page);
  const archivedRow = screen(page)
    .getByRole("option")
    .filter({ hasText: ARCHIVED_HOUSTON_MISSION.title });
  await expect(
    archivedRow.getByText(ARCHIVED_HOUSTON_MISSION.tag, { exact: true }),
  ).toBeVisible();
});

test("restores cached missions before starting fresh board reads", async ({
  page,
}) => {
  await seedUserScopedToken(page);
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await expect
    .poll(async () => (await persistedMirrorHeads(page)) ?? [], {
      timeout: 15_000,
    })
    .toContain("all-conversations");
  await page.addInitScript((holdMs: number) => {
    const w = window as typeof window & {
      __queryRestoreStarted?: boolean;
      __queryRestoreReleased?: boolean;
      __boardReadsDuringRestore?: number;
    };
    let held = 0;
    w.__boardReadsDuringRestore = 0;
    const nativeFetch = window.fetch;
    window.fetch = function countedFetch(input, init) {
      const url = input instanceof Request ? input.url : String(input);
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (
        held > 0 &&
        method === "GET" &&
        /\/agents\/[^/]+\/activities(\?|$)/.test(
          new URL(url, location.href).pathname,
        )
      ) {
        w.__boardReadsDuringRestore = (w.__boardReadsDuringRestore ?? 0) + 1;
      }
      return nativeFetch.call(this, input, init);
    };
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
      held += 1;
      w.__queryRestoreStarted = true;
      const release = (settle: () => void) =>
        setTimeout(() => {
          held -= 1;
          if (held === 0) w.__queryRestoreReleased = true;
          settle();
        }, holdMs);
      nativeRequest.addEventListener("success", (event) => {
        release(() => delayedRequest.onsuccess?.(event));
      });
      nativeRequest.addEventListener("error", (event) => {
        release(() => delayedRequest.onerror?.(event));
      });
      return delayedRequest;
    };
  }, RESTORE_HOLD_MS);

  let boardReads = 0;
  await page.route("**/agents/*/activities", async (route) => {
    if (route.request().method() === "GET") boardReads += 1;
    await route.continue();
  });
  await page.reload();
  await page.waitForFunction(
    () =>
      (window as typeof window & { __queryRestoreStarted?: boolean })
        .__queryRestoreStarted === true,
  );
  await page.waitForFunction(
    () =>
      (window as typeof window & { __queryRestoreReleased?: boolean })
        .__queryRestoreReleased === true,
    undefined,
    { timeout: RESTORE_HOLD_MS * 3 },
  );

  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __boardReadsDuringRestore?: number })
          .__boardReadsDuringRestore,
    ),
  ).toBe(0);
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect.poll(() => boardReads).toBe(1);
  await page.waitForTimeout(500);
  expect(boardReads).toBe(1);
});

test("paints cached missions immediately while cold-start reads are held", async ({
  page,
  request,
}) => {
  await seedUserScopedToken(page);
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await expect
    .poll(async () => (await persistedMirrorHeads(page)) ?? [], {
      timeout: 15_000,
    })
    .toContain("all-conversations");

  await request.post(`${FAKE_HOST_URL}/__test__/hold-agent-reads`, {
    data: { ms: 20_000 },
  });
  await page.reload();

  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible({
    timeout: 12_000,
  });
});

test("opens a mission's chat when its card is clicked", async ({ page }) => {
  await page.goto("/");

  await missionCard(page, "Plan a trip to Tokyo").click();

  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("keeps the open chat when clicking app chrome outside the panel", async ({
  page,
}) => {
  await page.goto("/");
  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();

  await page.getByRole("button", { name: "Collapse sidebar" }).click();

  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible();
});

test("filters the board with the search box", async ({ page }) => {
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(missionCard(page, "Draft the launch email")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search tasks" }).fill("Tokyo");

  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(missionCard(page, "Draft the launch email")).toHaveCount(0);
});

test("moves a mission to the Done column", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await card.getByRole("button", { name: "Move to done" }).click();

  await expect(
    page
      .locator('[data-kanban-column="done"]')
      .getByText("Plan a trip to Tokyo"),
  ).toBeVisible();
});

test("archives a Done mission from its card", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-2"]');
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Archive" }).click();

  await expect(missionCard(page, "Draft the launch email")).toHaveCount(0);
  await openArchivedTasks(page);
  await expect(screen(page).getByText("Draft the launch email")).toBeVisible();
});

test("offers no archive box on a Needs-you card", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await expect(
    card.getByRole("button", { name: "Move to done" }),
  ).toBeVisible();
  await expect(card.getByRole("button", { name: "Archive" })).toHaveCount(0);
});

test("renames a mission to a multi-word title without the space closing the editor", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-1"]');
  await card.hover();
  await card.getByRole("button", { name: "Change title" }).click();

  const input = card.getByRole("textbox");
  await expect(input).toHaveValue("Plan a trip to Tokyo");
  await input.fill("");
  await input.pressSequentially("Two words");

  await expect(input).toHaveValue("Two words");
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toHaveCount(0);

  await input.press("Enter");
  await expect(card.getByText("Two words")).toBeVisible();
});

test("deletes a mission from the board", async ({ page }) => {
  await page.goto("/");
  const card = page.locator('[data-kanban-card="act-2"]');
  await card.hover();
  await card.getByRole("button", { name: "Delete" }).click();

  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(missionCard(page, "Draft the launch email")).toHaveCount(0);
});

async function openTeamBoard(page: Page): Promise<void> {
  await openTeamSection(page, "Tasks");
}

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
  await request.post(`${FAKE_HOST_URL}/__test__/fail-agent-reads`, {
    data: { agentIds: [broken.id] },
  });

  await page.goto("/");
  await openTeamBoard(page);

  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(missionCard(page, "Draft the launch email")).toBeVisible();
  await expect(
    page.getByText("Some tasks could not load. We are trying again."),
  ).toHaveCount(0);
});

test("re-reads the restored board on boot so missions created offline appear", async ({
  page,
  request,
}) => {
  await seedUserScopedToken(page);
  await page.route("**/v1/events*", (route) => route.abort());
  await page.goto("/");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  await expect
    .poll(async () => (await persistedMirrorHeads(page)) ?? [], {
      timeout: 15_000,
    })
    .toContain("all-conversations");

  const agedAt = Date.now() - 24 * 60 * 60 * 1_000;
  await expect
    .poll(async () => {
      await ageQueryMirror(page, agedAt);
      return await newestMirrorUpdatedAt(page);
    })
    .toBe(agedAt);

  const written = await request.post(
    `${FAKE_HOST_URL}/agents/${SEED_AGENT_ID}/activities`,
    { data: { title: "Overnight expense report", status: "needs_you" } },
  );
  expect(written.ok()).toBe(true);

  await page.reload();
  await openTeamBoard(page);

  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(missionCard(page, "Overnight expense report")).toBeVisible();
});
