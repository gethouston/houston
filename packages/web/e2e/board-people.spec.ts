import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { missionCard, openTeamSection } from "./support/team-nav";

const TEAMS_CAPS = { multiplayer: true, teams: true, role: "owner" };

const PEOPLE_LABEL = "People on this task";

async function armTeams(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: TEAMS_CAPS,
  });
}

async function openTeamBoard(page: Page): Promise<void> {
  await page.goto("/");
  await openTeamSection(page, "Tasks");
}

function card(page: Page, title: string) {
  return page.getByRole("option").filter({ hasText: title });
}

function stack(page: Page, title: string) {
  return card(page, title).locator(
    `[role="group"][aria-label="${PEOPLE_LABEL}"]`,
  );
}

function overflowChip(page: Page, title: string) {
  return stack(page, title).locator('button[aria-label="All people"]');
}

test.use({ teamBoard: true });

test("a two-person mission shows both faces, no overflow chip", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  const faces = stack(page, "Plan a trip to Tokyo").locator(
    '[data-slot="avatar"]',
  );
  await expect(faces).toHaveCount(2);
  for (const i of [0, 1]) {
    const ring = await faces
      .nth(i)
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
  }
  await expect(faces.nth(0)).toHaveText("AL");
  await expect(faces.nth(1)).toHaveText("BS");
  await expect(overflowChip(page, "Plan a trip to Tokyo")).toHaveCount(0);
});

test("a seven-person mission caps at five faces and shows a +2 chip", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(page.getByText("Draft the launch email")).toBeVisible();

  const launch = stack(page, "Draft the launch email");
  await expect(launch.locator('[data-slot="avatar"]')).toHaveCount(5);

  const chip = overflowChip(page, "Draft the launch email");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("+2");
});

test("the +N chip expands to every contributor, none unreachable", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(page.getByText("Draft the launch email")).toBeVisible();

  await overflowChip(page, "Draft the launch email").click();

  for (const name of [
    "Ada Lovelace",
    "Bob Stone",
    "Cleo Nakamura",
    "Dmitri Volkov",
    "Elena Ruiz",
    "Farid Haddad",
    "Gita Raman",
  ]) {
    await expect(page.getByRole("dialog").getByText(name)).toBeVisible();
  }
});

test("initials faces are opaque, so an overlapped face never bleeds through", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();

  const fallbacks = stack(page, "Plan a trip to Tokyo").locator(
    '[data-slot="avatar-fallback"]',
  );
  await expect(fallbacks).toHaveCount(2);

  const count = await fallbacks.count();
  for (let i = 0; i < count; i++) {
    const alpha = await fallbacks.nth(i).evaluate((el) => {
      const match = /^rgba?\(([^)]+)\)$/.exec(
        getComputedStyle(el).backgroundColor,
      );
      if (!match) return Number.NaN;
      const parts = match[1].split(",").map((p) => p.trim());
      return parts.length === 4 ? Number(parts[3]) : 1;
    });
    expect(alpha).toBe(1);
  }
});

test("the card body reserves a gutter so text never runs under the stack", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(page.getByText("Draft the launch email")).toBeVisible();

  const description = card(page, "Draft the launch email").getByText(
    "Write the beta announcement to the waitlist",
  );
  const textRight = await description.evaluate(
    (el) =>
      el.getBoundingClientRect().right -
      Number.parseFloat(getComputedStyle(el).paddingRight),
  );
  const stackBox = await stack(page, "Draft the launch email").boundingBox();
  if (!stackBox) throw new Error("face stack did not lay out");

  expect(textRight).toBeLessThanOrEqual(stackBox.x - 2);
});
