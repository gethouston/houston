import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

test("opens the AI hub, browses providers and models via modals", async ({
  page,
}) => {
  await page.goto("/");

  await openNavRow(page, "ai-hub");

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

  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  const anthropicTile = page.getByRole("button", {
    name: "Anthropic Your Claude subscription",
  });
  await expect(anthropicTile).toBeVisible();

  await expect(page.getByText("Session limit")).toBeVisible();
  await expect(page.getByText(/42% used/)).toBeVisible();
  await expect(page.getByText("Weekly limit")).toBeVisible();
  await expect(page.getByText(/12% used/)).toBeVisible();

  await expect(page.getByText("max", { exact: true })).toBeVisible();
  await expect(anthropicTile).not.toHaveAccessibleName(/max/i);

  await anthropicTile.click();
  const providerModal = page.getByRole("dialog");
  await expect(providerModal).toBeVisible();
  await expect(providerModal.getByPlaceholder("Search models")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(
    page.getByRole("button", { name: /^Connect / }).first(),
  ).toBeVisible();

  const search = page.getByPlaceholder("Search AI models and providers");
  await expect(search).toBeVisible();
  await search.fill("claude");
  await allModels.click();
  await expect(search).toHaveValue("claude");
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  for (const facet of ["AI provider", "Good at", "Cost", "Memory"]) {
    await expect(
      page.getByRole("button", { name: facet, exact: true }),
    ).toBeVisible();
  }

  await page
    .getByRole("heading", { name: "Available" })
    .locator("..")
    .getByRole("button", { name: /Claude/i })
    .first()
    .click();
  const modelModal = page.getByRole("dialog");
  await expect(modelModal).toBeVisible();
  await expect(modelModal.getByText("Get it through")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByPlaceholder("Search AI models and providers"),
  ).toBeVisible();
});

function connectedRow(page: Page): { body: Locator; root: Locator } {
  const body = page.getByRole("button", {
    name: "Anthropic Your Claude subscription",
  });
  return { body, root: body.locator("xpath=../..") };
}

async function openHub(page: Page): Promise<void> {
  await page.goto("/");
  await openNavRow(page, "ai-hub");
}

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

const TIER_PADDING_PX = 11;

test("a connected row keeps its height as usage lands, and ends at its content", async ({
  page,
}) => {
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

  expect(await tierDeadSpace(root)).toBeLessThanOrEqual(TIER_PADDING_PX);

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

  expect(await tierDeadSpace(root)).toBeLessThanOrEqual(TIER_PADDING_PX);

  const loaded = await root.boundingBox();
  expect((loading?.height ?? 0) - (loaded?.height ?? 0)).toBeGreaterThan(30);
});

test("the whole connected card opens the provider modal, meters included", async ({
  page,
}) => {
  await openHub(page);
  const { body, root } = connectedRow(page);
  await expect(page.getByText("Weekly limit")).toBeVisible();

  await page.getByText("Weekly limit").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).cursor))
    .toBe("pointer");

  await body.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
});

async function tabTo(page: Page, target: Locator): Promise<void> {
  await page.getByPlaceholder("Search AI models and providers").click();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("never tabbed onto the target");
}

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
  expect(resting.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(resting.outlineStyle).toBe("solid");
  expect(resting.outlineWidth).toBe("1px");
  expect(resting.radius).toBe("12px");
  expect(resting.scale).toBe("none");

  const box = await root.boundingBox();
  await page.mouse.move((box?.x ?? 0) + 40, (box?.y ?? 0) + 20);
  await page.mouse.down();
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).scale))
    .toBe("0.98");
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.move(0, 0);
  await expect
    .poll(() => root.evaluate((el) => getComputedStyle(el).scale))
    .toBe("none");

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
  expect(focused.bodyRing).toBe("none");
});

test("a connected card carries no chevron, and its meters span the card", async ({
  page,
}) => {
  await openHub(page);
  const { body, root } = connectedRow(page);
  await expect(page.getByText("Weekly limit")).toBeVisible();

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
  expect(edges.meters.left - edges.card.left).toBe(12);
  expect(edges.card.right - edges.meters.right).toBe(12);
});
