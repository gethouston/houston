import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The Usage page's "Time worked" (compute) section — hosted-cloud analytics of
 * how long each agent's engine ran per day. The section exists ONLY where the
 * gateway advertises `capabilities.computeUsage` (desktop/self-host never do),
 * and its data comes from `GET /v1/org/compute-usage`, armed here via the fake
 * host's `/__test__/compute-usage` control. See `@houston/fake-host` README +
 * `knowledge-base/ui-testing.md`.
 */

const DAY_MS = 86_400_000;
const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

// The UI shows time worked (activeMs); awakeMs rides along larger so a
// regression to displaying awake time would double every asserted number.
function row(
  agentSlug: string,
  daysAgo: number,
  workMs: number,
  turns = 0,
  routineRuns = 0,
) {
  return {
    agentSlug,
    day: day(daysAgo),
    awakeMs: workMs * 2,
    activeMs: workMs,
    wakes: 1,
    turns,
    routineRuns,
  };
}

async function armComputeUsage(
  request: APIRequestContext,
  seed: { rows: unknown[]; awakeNow: string[] } | null,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { computeUsage: seed !== null },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/compute-usage`, {
    data: { seed },
  });
}

// ── 1. Desktop/self-host guard: no capability, no section, no fetch ────────

test("without the computeUsage capability the Usage page shows only the account sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  // The compute section is absent; the account sections (the seeded Anthropic
  // OAuth account lands under "AI subscriptions") stand on their own.
  await expect(page.getByRole("heading", { name: "Time worked" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "AI subscriptions" }),
  ).toBeVisible();
});

// ── 2. Armed + seeded: summary, bars, per-agent rows ────────────────────────

test("with data the section shows the total, daily bars, and per-agent rows", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, {
    rows: [
      // Seed agent: resolves to its display name. 2h05m worked today + 1h yesterday.
      row("houston-assistant", 0, 125 * 60_000, 8, 2),
      row("houston-assistant", 1, 60 * 60_000, 3, 0),
      // A since-deleted agent humanizes from its slug.
      row("sales-bot", 1, 30 * 60_000, 1, 0),
      // A deleted agent's bare wire id, with real work: labels "Removed agent".
      row("40e4d673e72e86df", 1, 5 * 60_000, 1, 0),
      // An awake-but-never-working ghost (e.g. residual zero days): the row
      // carries only awakeMs, so the by-agent list must not show it at all.
      {
        agentSlug: "1dee000000000000",
        day: day(0),
        awakeMs: 10 * 60_000,
        activeMs: 0,
        wakes: 2,
        turns: 0,
        routineRuns: 0,
      },
    ],
    awakeNow: ["houston-assistant"],
  });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  await expect(
    page.getByRole("heading", { name: "Time worked" }),
  ).toBeVisible();
  // 2h05 + 1h + 30m + 5m = 3h 40m across 15 tasks (10 + 3 + 1 + 1); the
  // awake-only ghost contributes nothing.
  await expect(page.getByText("Your agents worked 3h 40m")).toBeVisible();
  await expect(page.getByText("15 tasks")).toBeVisible();

  // 7 daily bars, each self-describing ("Jul 15: worked 2h 05m, 10 tasks").
  await expect(page.getByRole("img", { name: /: worked / })).toHaveCount(7);

  // Per-agent rows: the seed agent resolves to its display name (3h 05m
  // across 13 tasks); the deleted slug humanizes. Scope
  // to the compute section — the AI-accounts cards below are also list items
  // and their "not metered yet" copy mentions Houston by name.
  const computeSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Time worked" }) });
  const houston = computeSection
    .getByRole("listitem")
    .filter({ hasText: "Houston" });
  await expect(houston).toContainText("3h 05m");
  await expect(houston).toContainText("13 tasks");
  // No liveness badge: pod up/idle state is infrastructure the user never sees.
  await expect(houston.getByText("Online")).toHaveCount(0);
  const sales = computeSection
    .getByRole("listitem")
    .filter({ hasText: "Sales bot" });
  await expect(sales).toContainText("30m");
  await expect(sales).toContainText("1 task");

  // The deleted agent's bare wire id reads "Removed agent", never raw hex...
  const removed = computeSection
    .getByRole("listitem")
    .filter({ hasText: "Removed agent" });
  await expect(removed).toContainText("5m");
  await expect(page.getByText("40e4d673e72e86df")).toHaveCount(0);
  // ...and the awake-only ghost is not listed at all.
  await expect(page.getByText("1dee000000000000")).toHaveCount(0);

  // The account half keeps its own section heading below the compute section.
  await expect(
    page.getByRole("heading", { name: "AI subscriptions" }),
  ).toBeVisible();
});

// ── 3. Range switch re-buckets locally ──────────────────────────────────────

test("switching the range changes the bar count without a new fetch", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, {
    rows: [row("houston-assistant", 0, 60 * 60_000, 1, 0)],
    awakeNow: [],
  });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  const bars = page.getByRole("img", { name: /: worked / });
  await expect(bars).toHaveCount(7);
  await page.getByRole("tab", { name: "30 days" }).click();
  await expect(bars).toHaveCount(30);
  await page.getByRole("tab", { name: "3 months" }).click();
  await expect(bars).toHaveCount(13);
});

// ── 4. Armed but no data yet: the honest empty state ───────────────────────

test("with the capability but no rows the section shows its empty state", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, { rows: [], awakeNow: [] });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  await expect(
    page.getByRole("heading", { name: "Time worked" }),
  ).toBeVisible();
  await expect(page.getByText("No time worked yet")).toBeVisible();
  await expect(
    page.getByText(
      "When your agents work on tasks, their time will show here.",
    ),
  ).toBeVisible();
});
