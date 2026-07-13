import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * The host's global reactivity stream (`/v1/events`) must actually reach the
 * app: a server-side domain event has to invalidate the matching query and
 * trigger a refetch. Regression guard for the unbound-fetch "Illegal
 * invocation" bug that silently killed the whole stream in browsers — every
 * unit test passed (Node's fetch is receiver-agnostic) while no server event
 * ever reached a real client, so agent-written routines/skills/files never
 * refreshed without a remount.
 */
test("a server-emitted domain event triggers a client refetch", async ({
  page,
  emitHostEvent,
}) => {
  let routineFetches = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && req.url().includes("/routines"))
      routineFetches += 1;
  });

  await page.goto("/");
  await page.locator('[data-tour-target="tab-routines"]').click();
  await expect(
    page.getByRole("button", { name: "New automation" }).first(),
  ).toBeVisible();

  // Let the mount-time fetches settle, then take the baseline.
  await page.waitForTimeout(500);
  const baseline = routineFetches;

  // A host-side change (e.g. the agent writing routines.json caught by the
  // host's watcher) emits RoutinesChanged on /v1/events → the app must
  // refetch the routines query without any navigation.
  await emitHostEvent("RoutinesChanged", SEED_AGENT_ID);
  await expect
    .poll(() => routineFetches, { timeout: 10_000 })
    .toBeGreaterThan(baseline);
});
