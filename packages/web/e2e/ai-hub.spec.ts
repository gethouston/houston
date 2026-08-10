import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * The AI models hub, end to end against the fake host — now in the shared
 * catalog-shell grammar (the same layout as the Integrations page): a
 * consolidated "Connected" strip repeated over both provider and model modes
 * (the fake host seeds Claude/Anthropic connected). Each connected card carries
 * that account's
 * LIVE usage (plan chip + rate-limit meters) — there is no separate usage
 * screen (HOU-789). A strip card or a provider row opens the provider MODAL from
 * anywhere on the card, meters included (it embeds the same model card browser
 * as the model directory); the ghost `+` on a row is the direct connect affordance
 * and the one part of the row that is not that target. Flow:
 * sidebar nav → strip row opens the provider modal → Escape closes →
 * Available shows connectable rows with their `+` → AI Models keeps the query
 * and adds four header facets → a row opens the model MODAL ("Get it through"
 * offers) → Escape closes. OAuth is never driven (no credentials in the
 * harness); we assert presence + the modal open/close flow only.
 */
test("opens the AI hub, browses providers and models via modals", async ({
  page,
}) => {
  await page.goto("/");

  // The sidebar carries the top-level item. Opening it lands on the hub.
  await page.getByRole("button", { name: "AI models" }).click();

  // Scoped to the header nav: the sidebar row shares the "AI Models" name.
  const headerNav = page.getByRole("navigation", {
    name: "AI providers and models",
  });
  await expect(
    headerNav.getByRole("button", { name: "AI Providers", exact: true }),
  ).toBeVisible();
  const allModels = headerNav.getByRole("button", {
    name: "AI Models",
    exact: true,
  });
  await expect(allModels).toBeVisible();
  await expect(page.getByRole("heading", { name: "Available" })).toBeVisible();

  // The consolidated Connected strip sits above Available: the seeded
  // Anthropic connection is a row (name + its subscription subtitle), not a row
  // in the browse grid.
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  const anthropicTile = page.getByRole("button", {
    name: "Anthropic Your Claude subscription",
  });
  await expect(anthropicTile).toBeVisible();

  // The account's live usage rides the row itself: both rate-limit windows the
  // fake host reports, each with its percent and reset note.
  await expect(page.getByText("Session limit")).toBeVisible();
  await expect(page.getByText(/42% used/)).toBeVisible();
  await expect(page.getByText("Weekly limit")).toBeVisible();
  await expect(page.getByText(/12% used/)).toBeVisible();

  // The plan chip renders, but OUTSIDE the row button: a button's descendants
  // are presentational, so an untranslated "max" inside it would either be
  // noise in the row's accessible name or invisible to assistive tech.
  await expect(page.getByText("max", { exact: true })).toBeVisible();
  await expect(anthropicTile).not.toHaveAccessibleName(/max/i);

  // A row opens the provider MODAL: a Radix dialog that embeds the shared
  // model card browser (its own search box), not a full-page drill-in.
  await anthropicTile.click();
  const providerModal = page.getByRole("dialog");
  await expect(providerModal).toBeVisible();
  await expect(providerModal.getByPlaceholder("Search models")).toBeVisible();

  // Escape closes the modal, returning to the marketplace behind it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Available browses only the NOT-connected providers as flat rows,
  // each with a ghost `+` connect affordance at its right edge.
  await expect(
    page.getByRole("button", { name: /^Connect / }).first(),
  ).toBeVisible();

  // The ONE page-level query survives the switch into the model directory.
  const search = page.getByPlaceholder("Search AI models and providers");
  await expect(search).toBeVisible();
  await search.fill("claude");
  await allModels.click();
  await expect(search).toHaveValue("claude");
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  for (const facet of ["AI provider", "Good at", "Cost", "Memory"]) {
    // exact: the "AI provider" facet's name is a prefix of the lozenge's.
    await expect(
      page.getByRole("button", { name: facet, exact: true }),
    ).toBeVisible();
  }

  // A model row (name + lab, whole row is the button) opens the model MODAL:
  // its specs + the "Get it through" list of providers that offer it. Scope to
  // the Available section so the filtered Connected strip cannot shadow it.
  await page
    .getByRole("heading", { name: "Available" })
    .locator("..")
    .getByRole("button", { name: /Claude/i })
    .first()
    .click();
  const modelModal = page.getByRole("dialog");
  await expect(modelModal).toBeVisible();
  await expect(modelModal.getByText("Get it through")).toBeVisible();

  // Escape returns to the directory (the search box is back).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByPlaceholder("Search AI models and providers"),
  ).toBeVisible();
});

/** The seeded Claude card's body, and the `CatalogRow` root that owns its
 *  surface, its hover wash and its click target — two levels above the body
 *  (body → the card's top line → the root, which also holds the `below` meters
 *  tier). */
function connectedRow(page: Page): { body: Locator; root: Locator } {
  const body = page.getByRole("button", {
    name: "Anthropic Your Claude subscription",
  });
  return { body, root: body.locator("xpath=../..") };
}

/** Open the AI models hub from the sidebar. */
async function openHub(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "AI models" }).click();
}

/**
 * The dead space the usage tier leaves UNDER its own content: the tier's box
 * minus the meters it contains. That is the row's bottom padding (`pb-2.5`,
 * 10px) and nothing else — any reservation beyond the content shows up here.
 */
function tierDeadSpace(root: Locator): Promise<number> {
  return root.evaluate((el) => {
    const tier = el.lastElementChild;
    const content = tier?.firstElementChild;
    if (!tier || !content) throw new Error("row has no usage tier");
    return (
      tier.getBoundingClientRect().bottom -
      content.getBoundingClientRect().bottom
    );
  });
}

/** The bottom padding under the usage tier's content (`pb-2.5`), plus a pixel
 *  of rounding slack. Anything more is reserved dead space. */
const TIER_PADDING_PX = 11;

/**
 * The three structural promises the Connected card makes, asserted against real
 * layout because none of them is visible in the markup alone:
 *
 *  1. NO layout shift when usage lands for the account shape the skeleton is
 *     drawn as (a two-window subscription — the common one). The plan chip's
 *     slot is held open too, so nothing reflows sideways either.
 *  2. A loaded card is sized by its CONTENT: the tier ends one padding step
 *     after the last meter, never at a reserved height (an account with a
 *     single window used to trail a bar's worth of dead card).
 *  3. The hover wash covers the meters. They live inside the card's own hover
 *     surface (`CatalogRow`'s `below` slot), not in a sibling below it — the
 *     card and its meters are ONE thing, never a card stapled under a row. The
 *     card now paints a resting surface of its own, so the wash is asserted as
 *     a CHANGE from that surface, not merely as "not transparent".
 */
test("a connected row keeps its height as usage lands, and ends at its content", async ({
  page,
}) => {
  // Hold the usage answer so the loading frame is observable at all.
  await page.route("**/providers/usage**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await openHub(page);

  const { body, root } = connectedRow(page);
  await expect(body).toBeVisible();
  const loading = await root.boundingBox();

  await expect(page.getByText("Session limit")).toBeVisible();
  const loaded = await root.boundingBox();
  expect(loaded?.height).toBe(loading?.height);
  expect(loaded?.y).toBe(loading?.y);

  // Two windows landed in a two-bar skeleton, so the row is both unshifted AND
  // flush: no leftover reservation under the second bar.
  expect(await tierDeadSpace(root)).toBeLessThanOrEqual(TIER_PADDING_PX);

  // The wash is a CHANGE from the card's own resting fill: the background
  // transition interpolates, so poll rather than read the frame the pointer
  // landed on (mid-transition it is still the resting surface).
  const rest = await root.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await body.hover();
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(rest);

  const washBottom = await root.evaluate(
    (el) => el.getBoundingClientRect().bottom,
  );
  const metersBottom = await page
    .getByText("Weekly limit")
    .evaluate((el) => el.getBoundingClientRect().bottom);
  expect(washBottom).toBeGreaterThan(metersBottom);
});

/** Arm a ONE-window account: the shape the two-bar skeleton cannot predict. */
async function armSingleWindowUsage(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/provider-usage`, {
    data: {
      rows: [
        {
          provider: "anthropic",
          status: "ok",
          plan: "pro",
          windows: [
            {
              id: "week",
              usedPercent: 23,
              resetsAt: new Date(Date.now() + 96 * 3_600_000).toISOString(),
            },
          ],
        },
      ],
    },
  });
}

/**
 * The other half of the sizing contract: an account whose real shape is NOT the
 * skeleton's. A single weekly window (an OpenAI-style account) must leave the
 * card ending right after its one bar — the tier used to reserve room for two,
 * so such a row trailed a bar's worth of empty card. The row settles ONCE, from
 * the pre-data frame to its content, which is the only resize a row may make
 * (readings are retained across background refetches, so polls never re-enter
 * the skeleton).
 */
test("a one-window account's card ends flush after its single meter", async ({
  page,
  request,
}) => {
  await armSingleWindowUsage(request);
  await page.route("**/providers/usage**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await openHub(page);

  const { body, root } = connectedRow(page);
  await expect(body).toBeVisible();
  const loading = await root.boundingBox();

  await expect(page.getByText("Weekly limit")).toBeVisible();
  await expect(page.getByText("Session limit")).toHaveCount(0);

  // No dead band: the card ends at the meter it actually has.
  expect(await tierDeadSpace(root)).toBeLessThanOrEqual(TIER_PADDING_PX);

  // And it got there by SHRINKING off the second skeleton bar (28px) and the
  // gap above it (10px) — proof the reservation is gone, not merely hidden.
  const loaded = await root.boundingBox();
  expect((loading?.height ?? 0) - (loaded?.height ?? 0)).toBeGreaterThan(30);
});

/**
 * The whole card is ONE target. The meters are part of the account, not
 * decoration under it, so a click on them opens the same provider modal the row
 * body opens — and the keyboard reaches that same action through the row's ONE
 * focusable element, whose activation must open it exactly once.
 */
test("the whole connected card opens the provider modal, meters included", async ({
  page,
}) => {
  await openHub(page);
  const { body, root } = connectedRow(page);
  await expect(page.getByText("Weekly limit")).toBeVisible();

  // A click on the meters tier — the bottom of the card, outside the button.
  await page.getByText("Weekly limit").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // The card carries the pointer affordance across all of it, meters included.
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).cursor))
    .toBe("pointer");

  // The keyboard path: the row body is the ONE focusable element in the card,
  // and its activation opens the same modal (its synthetic click is what the
  // card's handler reads, so it can never fire twice).
  await body.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

/** Walk the keyboard onto `target` from the page's search field, so focus
 *  arrives the way a keyboard user's does — `:focus-visible` and all. A
 *  programmatic `.focus()` does NOT set it, so it cannot test a focus ring. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  await page.getByPlaceholder("Search AI models and providers").click();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("never tabbed onto the target");
}

/**
 * The card reads as pressable BEFORE it is touched. A connected account is not a
 * line in a list — it carries its own tier of live detail and it opens the
 * account — so it paints a surface and a hairline at rest, and the hover wash
 * enhances that instead of being the only signal there is anything here.
 *
 * Asserted against computed style because "looks clickable" is exactly the kind
 * of promise that regresses invisibly: a fill that is transparent at rest, a
 * press that does not answer, or a focus ring drawn around the body button
 * instead of the card all still render a perfectly readable row.
 */
test("a connected card paints its surface and ring at rest, and answers a press", async ({
  page,
}) => {
  await openHub(page);
  const { body, root } = connectedRow(page);
  await expect(page.getByText("Weekly limit")).toBeVisible();

  const resting = await root.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      background: s.backgroundColor,
      outlineWidth: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      outlineColor: s.outlineColor,
      radius: s.borderTopLeftRadius,
      scale: s.scale,
    };
  });
  // A surface, not the canvas showing through, and a hairline ring around it.
  expect(resting.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(resting.outlineStyle).toBe("solid");
  expect(resting.outlineWidth).toBe("1px");
  expect(resting.radius).toBe("12px");
  expect(resting.scale).toBe("none");

  // Press feedback: holding the pointer down scales the card down. Tailwind v4
  // scales via the standalone `scale` property, so that is what is read here.
  const box = await root.boundingBox();
  await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 20);
  await page.mouse.down();
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).scale))
    .toBe("0.98");
  await page.mouse.up();
  await page.keyboard.press("Escape");

  // And it lets go: the press is a response, not a state.
  await page.mouse.move(0, 0);
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).scale))
    .toBe("none");

  // Keyboard focus rings the WHOLE card, not just the body button inside it:
  // the indicator has to describe the target, and the target is the card. It is
  // the same `outline` the resting hairline uses, thickened — a box-shadow ring
  // would be swallowed by the glass layer's own `box-shadow` on `.bg-card`.
  await tabTo(page, body);
  const focused = await root.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      width: s.outlineWidth,
      color: s.outlineColor,
      bodyRing: getComputedStyle(el.querySelector("button") as Element)
        .boxShadow,
    };
  });
  expect(focused.width).toBe("2px");
  expect(focused.color).not.toBe(resting.outlineColor);
  // ...and the body button no longer draws a competing ring of its own.
  expect(focused.bodyRing).toBe("none");
});

/**
 * Two things the card must NOT have, and one it must line up.
 *
 * No chevron: a chevron says "this line drills in", which is row language. The
 * card already looks pressable at rest, so the glyph is noise — and its absence
 * is asserted structurally (the card's ONLY svg is the brand mark) rather than
 * by class name, so re-adding any decorative glyph fails here.
 *
 * The meters tier starts at the BRAND MARK's left edge and runs to the card's
 * right edge — the tier is the card's own width, not an indent to the text
 * column, which is what made it read as a paragraph hanging off a row.
 */
test("a connected card carries no chevron, and its meters span the card", async ({
  page,
}) => {
  await openHub(page);
  const { body, root } = connectedRow(page);
  await expect(page.getByText("Weekly limit")).toBeVisible();

  // The brand mark is the one piece of art on the card.
  await expect(root.locator("svg")).toHaveCount(1);

  const edges = await body.evaluate((el) => {
    const card = el.parentElement?.parentElement as HTMLElement;
    const mark = el.firstElementChild as HTMLElement;
    const meters = card.lastElementChild?.firstElementChild as HTMLElement;
    const px = (n: Element) => {
      const b = n.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right) };
    };
    return { card: px(card), mark: px(mark), meters: px(meters) };
  });
  expect(edges.meters.left).toBe(edges.mark.left);
  // Full bleed to the trailing edge, on the card's own padding (12px both ends).
  expect(edges.meters.left - edges.card.left).toBe(12);
  expect(edges.card.right - edges.meters.right).toBe(12);
});
