import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The Usage page's "Running time" (compute) section — hosted-cloud analytics of
 * how long each agent's engine ran per day. The section exists ONLY where the
 * gateway advertises `capabilities.computeUsage` (desktop/self-host never do),
 * and its data comes from `GET /v1/org/compute-usage`, armed here via the fake
 * host's `/__test__/compute-usage` control. See `@houston/fake-host` README +
 * `knowledge-base/ui-testing.md`.
 */

const DAY_MS = 86_400_000;
const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);

function row(
  agentSlug: string,
  daysAgo: number,
  awakeMs: number,
  turns = 0,
  routineRuns = 0,
) {
  return {
    agentSlug,
    day: day(daysAgo),
    awakeMs,
    activeMs: Math.floor(awakeMs / 2),
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

test("without the computeUsage capability the Usage page shows only AI accounts", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  // The compute section and its companion "AI accounts" sub-heading are both
  // absent — the page is byte-identical to the pre-feature layout.
  await expect(page.getByRole("heading", { name: "Running time" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("heading", { name: "AI accounts" })).toHaveCount(
    0,
  );
});

// ── 2. Armed + seeded: summary, bars, per-agent rows ────────────────────────

test("with data the section shows the total, daily bars, and per-agent rows", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, {
    rows: [
      // Seed agent: resolves to its display name. 2h05m today + 1h yesterday.
      row("houston-assistant", 0, 125 * 60_000, 8, 2),
      row("houston-assistant", 1, 60 * 60_000, 3, 0),
      // A since-deleted agent humanizes from its slug.
      row("sales-bot", 1, 30 * 60_000, 1, 0),
    ],
    awakeNow: ["houston-assistant"],
  });
  await page.goto("/");
  await page.locator('[data-tour-target="nav-usage"]').click();

  await expect(
    page.getByRole("heading", { name: "Running time" }),
  ).toBeVisible();
  // 2h05 + 1h + 30m = 3h 35m across 14 tasks (10 + 3 + 1).
  await expect(page.getByText("Your agents ran 3h 35m")).toBeVisible();
  await expect(page.getByText("14 tasks")).toBeVisible();

  // 7 daily bars, each self-describing ("Jul 15: ran 2h 05m, 10 tasks").
  await expect(page.getByRole("img", { name: /: ran / })).toHaveCount(7);

  // Per-agent rows: the seed agent resolves to its display name and wears the
  // running badge (3h 05m across 13 tasks); the deleted slug humanizes. Scope
  // to the compute section — the AI-accounts cards below are also list items
  // and their "not metered yet" copy mentions Houston by name.
  const computeSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Running time" }) });
  const houston = computeSection
    .getByRole("listitem")
    .filter({ hasText: "Houston" });
  await expect(houston.getByText("Running now")).toBeVisible();
  await expect(houston).toContainText("3h 05m");
  await expect(houston).toContainText("13 tasks");
  const sales = computeSection
    .getByRole("listitem")
    .filter({ hasText: "Sales bot" });
  await expect(sales).toContainText("30m");
  await expect(sales).toContainText("1 task");

  // The AI-accounts half keeps its own sub-heading below the compute section.
  await expect(
    page.getByRole("heading", { name: "AI accounts" }),
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

  const bars = page.getByRole("img", { name: /: ran / });
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
    page.getByRole("heading", { name: "Running time" }),
  ).toBeVisible();
  await expect(page.getByText("No running time yet")).toBeVisible();
  await expect(
    page.getByText("When your agents run, their time will show here."),
  ).toBeVisible();
});
