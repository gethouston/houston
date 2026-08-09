import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openAdminSection, openAnalyticsLens } from "./support/settings-nav";
import { screen } from "./support/team-nav";

/**
 * Time worked — hosted-cloud analytics of how long each agent's engine actually
 * ran per day. It is a LENS inside **Admin > Analytics** now, beside the
 * activity feed and the usage bars it was always read against; the standalone
 * rail screen is gone, because it held nothing else (per-AI-account usage moved
 * onto the AI Models hub's Connected rows, HOU-789) and a screen of one section
 * is a section.
 *
 * The gate did not move, only what it hides: the lens exists solely where the
 * gateway advertises `capabilities.computeUsage` (desktop/self-host never do),
 * and elsewhere the Analytics sub-tab is simply absent — which is also what
 * keeps its query from firing, since only the SELECTED lens is mounted.
 *
 * Reaching it needs Admin, so every test here arms a Teams OWNER on top of the
 * compute capability. The data comes from `GET /v1/org/compute-usage`, armed via
 * the fake host's `/__test__/compute-usage` control. See `@houston/fake-host`
 * README + `knowledge-base/ui-testing.md`.
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

/**
 * Arm the deployment: a Teams owner (so Admin exists in the rail at all) plus
 * the compute capability, which is what decides whether the Time worked lens is
 * offered. `seed: null` is the desktop/self-host shape — no capability, no data.
 */
async function armComputeUsage(
  request: APIRequestContext,
  seed: { rows: unknown[]; awakeNow: string[] } | null,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: {
      multiplayer: true,
      teams: true,
      role: "owner",
      computeUsage: seed !== null,
    },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/compute-usage`, {
    data: { seed },
  });
}

// ── 1. Desktop/self-host guard: no capability, no lens, no fetch ───────────

test("without the computeUsage capability Analytics offers no Time worked lens", async ({
  page,
  request,
}) => {
  await armComputeUsage(request, null);
  await page.goto("/");
  await openAdminSection(page, "Analytics");

  // A painted screen FIRST, so the absence below cannot pass on an Analytics
  // section that simply has not rendered: the two base lenses are there, and
  // Activity — the lead one — is the mounted body.
  const lens = (name: string) =>
    screen(page).getByRole("tab", { name, exact: true });
  await expect(lens("Activity")).toHaveAttribute("data-state", "active");
  await expect(lens("Usage")).toBeVisible();

  // Not merely empty: the sub-tab is absent, so nothing leads to a lens that
  // would have nothing to show — and its query never fires.
  await expect(lens("Time worked")).toHaveCount(0);
  await expect(screen(page).getByText("Time worked")).toHaveCount(0);
});

// ── 2. Armed + seeded: summary, bars, per-agent rows ────────────────────────

test("with data the lens shows the total, daily bars, and per-agent rows", async ({
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
  await openAnalyticsLens(page, "Time worked");

  // The Analytics sub-tab names the lens, so the body leads with its range
  // control rather than a heading of its own — and no "Usage"/"Compute" tab
  // grouping from the old screen survives.
  await expect(
    screen(page).getByRole("tab", { name: "Compute usage" }),
  ).toHaveCount(0);
  await expect(
    screen(page).getByRole("tab", { name: "Model usage" }),
  ).toHaveCount(0);

  // Only the seed agent counts: 2h05 + 1h = 3h 05m across 13 messages
  // (10 + 3). Deleted agents and ghosts contribute nothing anywhere.
  // With only one visible agent the summary equals its row, so scope the
  // message count to the summary paragraph (strict mode would match both).
  const summary = screen(page).getByText("Your agents worked 3h 05m");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("13 messages");

  // 7 daily bars, each self-describing ("Jul 15: worked 2h 05m, 10 messages").
  await expect(
    screen(page).getByRole("img", { name: /: worked / }),
  ).toHaveCount(7);

  // Per-agent rows: the seed agent resolves to its display name (3h 05m across
  // 13 messages). The lens carries only this list, so nothing to scope further.
  const houston = screen(page)
    .getByRole("listitem")
    .filter({ hasText: "Houston" });
  await expect(houston).toContainText("3h 05m");
  await expect(houston).toContainText("13 messages");
  // No liveness badge: pod up/idle state is infrastructure the user never sees.
  await expect(houston.getByText("Online")).toHaveCount(0);
  // Nothing outside the sidebar roster exists on the lens — no deleted
  // agents, no "Removed agent" placeholder, no raw wire ids.
  await expect(screen(page).getByText("Sales bot")).toHaveCount(0);
  await expect(screen(page).getByText("Removed agent")).toHaveCount(0);
  await expect(screen(page).getByText("40e4d673e72e86df")).toHaveCount(0);
  await expect(screen(page).getByText("1dee000000000000")).toHaveCount(0);

  // The AI accounts are NOT here: their usage lives on the hub's rows now.
  await expect(
    screen(page).getByRole("heading", { name: "AI subscriptions" }),
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
  await openAnalyticsLens(page, "Time worked");

  const bars = screen(page).getByRole("img", { name: /: worked / });
  await expect(bars).toHaveCount(7);
  await screen(page).getByRole("tab", { name: "30 days" }).click();
  await expect(bars).toHaveCount(30);
  await screen(page).getByRole("tab", { name: "3 months" }).click();
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
  await openAnalyticsLens(page, "Time worked");

  const houston = screen(page)
    .getByRole("listitem")
    .filter({ hasText: "Houston" });
  await expect(houston).toContainText("0m");
  await expect(houston).toContainText("0 messages");
  // The empty state is reserved for a roster with no agents at all.
  await expect(screen(page).getByText("No time worked yet")).toHaveCount(0);
});
