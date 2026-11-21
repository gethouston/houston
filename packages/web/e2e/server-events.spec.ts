import { SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";

test.use({ teamBoard: true });

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
  await openTeamSection(page, "Routines");
  await expect(
    page.getByRole("button", { name: "New routine" }).first(),
  ).toBeVisible();

  await page.waitForTimeout(500);
  const baseline = routineFetches;

  await emitHostEvent("RoutinesChanged", SEED_AGENT_ID);
  await expect
    .poll(() => routineFetches, { timeout: 10_000 })
    .toBeGreaterThan(baseline);
});
