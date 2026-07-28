import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  openSettings,
  openSettingsSection,
  settingsRow,
} from "./support/settings-nav";

/**
 * Settings > Time worked — hosted-cloud analytics of how long each agent's
 * engine actually ran per day. The whole SCREEN exists only where the gateway
 * advertises `capabilities.computeUsage` (desktop/self-host never do), because
 * it holds nothing else: per-AI-account usage moved onto the AI Models hub's
 * Connected rows (HOU-789), so an ungated deployment would open an empty page.
 * Its data comes from `GET /v1/org/compute-usage`, armed here via the fake
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

// ── 1. Desktop/self-host guard: no capability, no screen, no fetch ─────────

test("without the computeUsage capability Settings offers no Time worked row", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);

  // Not merely empty: the row is absent, so nothing leads to a screen that
  // would have nothing to show.
  await expect(settingsRow(page, "time-worked")).toHaveCount(0);
  await expect(page.getByText("Time worked")).toHaveCount(0);
});

// ── 2. Armed + seeded: summary, bars, per-agent rows ────────────────────────

test("with data the screen shows the total, daily bars, and per-agent rows", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, {
    rows: [
      // Seed agent: resolves to its display name. 2h05m worked today + 1h yesterday.
      row("houston-assistant", 0, 125 * 60_000, 8, 2),
      row("houston-assistant", 1, 60 * 60_000, 3, 0),
      // A since-deleted agent (not in the sidebar roster): invisible, even
      // with real work — the user only ever sees agents they actually have.
      row("sales-bot", 1, 30 * 60_000, 1, 0),
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
  await openSettingsSection(page, "time-worked");

  // The screen names itself, and no "Usage"/"Compute" wording survives.
  await expect(
    page.getByRole("heading", { name: "Time worked", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Compute usage" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Model usage" })).toHaveCount(0);

  // Only the seed agent counts: 2h05 + 1h = 3h 05m across 13 messages
  // (10 + 3). Deleted agents and ghosts contribute nothing anywhere.
  // With only one visible agent the summary equals its row, so scope the
  // message count to the summary paragraph (strict mode would match both).
  const summary = page.getByText("Your agents worked 3h 05m");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("13 messages");

  // 7 daily bars, each self-describing ("Jul 15: worked 2h 05m, 10 messages").
  await expect(page.getByRole("img", { name: /: worked / })).toHaveCount(7);

  // Per-agent rows: the seed agent resolves to its display name (3h 05m across
  // 13 messages). The screen carries only this list now, so nothing to scope.
  const houston = page.getByRole("listitem").filter({ hasText: "Houston" });
  await expect(houston).toContainText("3h 05m");
  await expect(houston).toContainText("13 messages");
  // No liveness badge: pod up/idle state is infrastructure the user never sees.
  await expect(houston.getByText("Online")).toHaveCount(0);
  // Nothing outside the sidebar roster exists on the page — no deleted
  // agents, no "Removed agent" placeholder, no raw wire ids.
  await expect(page.getByText("Sales bot")).toHaveCount(0);
  await expect(page.getByText("Removed agent")).toHaveCount(0);
  await expect(page.getByText("40e4d673e72e86df")).toHaveCount(0);
  await expect(page.getByText("1dee000000000000")).toHaveCount(0);

  // The AI accounts are NOT here: their usage lives on the hub's rows now.
  await expect(
    page.getByRole("heading", { name: "AI subscriptions" }),
  ).toHaveCount(0);
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
  await openSettingsSection(page, "time-worked");

  const bars = page.getByRole("img", { name: /: worked / });
  await expect(bars).toHaveCount(7);
  await page.getByRole("tab", { name: "30 days" }).click();
  await expect(bars).toHaveCount(30);
  await page.getByRole("tab", { name: "3 months" }).click();
  await expect(bars).toHaveCount(13);
});

// ── 4. No data yet: every roster agent is still visible immediately ────────

test("an agent with no usage rows appears immediately at zero", async ({
  page,
  request,
}) => {
  // A just-created agent has NO rows on the wire yet — the list is roster-
  // driven, so it must show up at "0m · 0 messages" without waiting for the
  // pod to report anything.
  await armComputeUsage(request, { rows: [], awakeNow: [] });
  await page.goto("/");
  await openSettingsSection(page, "time-worked");

  await expect(
    page.getByRole("heading", { name: "Time worked", level: 1 }),
  ).toBeVisible();
  const houston = page.getByRole("listitem").filter({ hasText: "Houston" });
  await expect(houston).toContainText("0m");
  await expect(houston).toContainText("0 messages");
  // The empty state is reserved for a roster with no agents at all.
  await expect(page.getByText("No time worked yet")).toHaveCount(0);
});
