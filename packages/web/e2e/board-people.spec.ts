import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openTeamSection } from "./support/team-nav";

/**
 * Mission cards carry the HUMANS on the mission as an overlapping face stack
 * (bottom-right of the card body). The attribution is server-stamped — the fake
 * host seeds `created_by` + `contributors` on both missions (state-store.ts) —
 * and the app renders it ONLY in multiplayer, so every assertion here first
 * arms `/__test__/capabilities`.
 *
 * What these guard (HOU-947): the stack renders at all (it never did in e2e
 * before, because nothing seeded attribution), the five-face cap collapses the
 * rest into a "+N" chip that reaches every contributor, and the faces are
 * OPAQUE — the bug was a translucent initials fill that let the face behind and
 * the card's own text show through the letters.
 */

/** Teams owner: multiplayer + Teams, top role. Face stacks are multiplayer-gated. */
const TEAMS_CAPS = { multiplayer: true, teams: true, role: "owner" };

/** Accessible group label of a card's face stack (app/src/locales/en/board.json). */
const PEOPLE_LABEL = "People on this task";

async function armTeams(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: TEAMS_CAPS,
  });
}

/**
 * Open the team's board — the CROSS-AGENT board the face stacks were built
 * for. Every board belongs to a team now, and the seeded workspace's default
 * team holds every agent, so this is the shared board. It has no default
 * person filter, which matters here: a board scoped to `me` would hide every
 * mission the signed-in user is not stamped on, and identity is off in this
 * project (no session uid), so nothing attributed would survive.
 */
async function openTeamBoard(page: Page): Promise<void> {
  await page.goto("/");
  await openTeamSection(page, "Tasks");
}

/** The mission card carrying `title` (the board's `role="option"` cards). */
function card(page: Page, title: string) {
  return page.getByRole("option").filter({ hasText: title });
}

/**
 * The face stack on that card. Addressed by attribute, not `getByRole`: the
 * card is an ARIA `option`, whose children are PRESENTATIONAL — the stack's
 * `role="group"` (and the chip's `button`) never reach the accessibility tree,
 * so a role query inside a card matches nothing.
 */
function stack(page: Page, title: string) {
  return card(page, title).locator(
    `[role="group"][aria-label="${PEOPLE_LABEL}"]`,
  );
}

/** The expandable "+N" overflow chip on that card's stack. */
function overflowChip(page: Page, title: string) {
  return stack(page, title).locator('button[aria-label="All people"]');
}

test("a two-person mission shows both faces, no overflow chip", async ({
  page,
  request,
}) => {
  await armTeams(request);
  await openTeamBoard(page);
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  const faces = stack(page, "Plan a trip to Tokyo").locator(
    '[data-slot="avatar"]',
  );
  await expect(faces).toHaveCount(2);
  // Each face carries the 2px surface-colored ring that makes the overlap read
  // as a cutout. `AvatarGroup` paints it through `*:data-[slot=avatar]`, so this
  // also guards the slot marker the tooltip trigger used to clobber.
  for (const i of [0, 1]) {
    const ring = await faces
      .nth(i)
      .evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
  }
  // Photo-less people fall back to initials, derived from the stored
  // contributor names ("Ada Lovelace" -> AL, "Bob Stone" -> BS).
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

  // All seven, including the two hidden behind the chip.
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
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

  const fallbacks = stack(page, "Plan a trip to Tokyo").locator(
    '[data-slot="avatar-fallback"]',
  );
  await expect(fallbacks).toHaveCount(2);

  // The regression: `bg-chip-subtle` resolves to ~3.5% alpha ink. Every face
  // must now paint a fully opaque person tone instead.
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
  // The CONTENT edge, not the border box: the reserve is the paragraph's own
  // padding-right, so its border box still spans the full card body.
  const textRight = await description.evaluate(
    (el) =>
      el.getBoundingClientRect().right -
      Number.parseFloat(getComputedStyle(el).paddingRight),
  );
  const stackBox = await stack(page, "Draft the launch email").boundingBox();
  if (!stackBox) throw new Error("face stack did not lay out");

  // Text must stop before the stack begins — no horizontal overlap. The ring
  // bleeds 2px left of the first face, so compare against that painted edge.
  expect(textRight).toBeLessThanOrEqual(stackBox.x - 2);
});
