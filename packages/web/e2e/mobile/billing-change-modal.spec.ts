import {
  armCapabilities,
  armChoice,
  CHOOSE,
  choiceModal,
  INNOVA,
  installChoiceClock,
  LA_FILA,
  ownerChoice,
  PERSONAL,
  SPACES_OWNER_CAPS,
} from "../support/billing-choice";
import { expect, test } from "../support/fixtures";

/**
 * On a phone the pricing-change modal is a full-height sheet, like the launch
 * announcement: the actions sit at the bottom, and the picker and its
 * success step open in the same sheet without a horizontal scroll.
 */

test("the modal fills the phone, and the picker and its success step open in the same sheet", async ({
  page,
}) => {
  await installChoiceClock(page);
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(ownerChoice());
  await page.goto("/");

  const modal = choiceModal(page);
  const next = modal.getByRole("button", { name: "Next", exact: true });
  await expect(next).toBeVisible({ timeout: 15_000 });
  const viewport = page.viewportSize();
  const box = await modal.boundingBox();
  expect(box && viewport && Math.round(box.y)).toBe(0);
  expect(box && viewport && Math.round(box.y + box.height)).toBe(
    viewport?.height,
  );
  const button = await next.boundingBox();
  expect(button && viewport && button.y > viewport.height / 2).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  await next.tap();
  // Page two seats its actions at the bottom too.
  const choose = modal.getByRole("button", { name: CHOOSE });
  await expect(choose).toBeVisible();
  const chooseBox = await choose.boundingBox();
  expect(chooseBox && viewport && chooseBox.y > viewport.height / 2).toBe(true);
  await choose.tap();
  const keep = modal.getByRole("button", {
    name: "Keep La Fila on the free tier",
  });
  await expect(keep).toBeVisible();
  const picking = await modal.boundingBox();
  expect(picking && Math.round(picking.y + picking.height)).toBe(
    viewport?.height,
  );
  const keepBox = await keep.boundingBox();
  expect(keepBox && viewport && keepBox.y > viewport.height / 2).toBe(true);

  await keep.tap();
  const done = modal.getByRole("button", { name: "Done" });
  await expect(done).toBeVisible();
  await expect(modal).toContainText("La Fila stays on the free tier");
  const doneBox = await done.boundingBox();
  expect(doneBox && viewport && doneBox.y > viewport.height / 2).toBe(true);
  await done.tap();
  await expect(modal).toBeHidden();

  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
  await page.clock.runFor(3_000);
  await expect(choiceModal(page)).toBeHidden();
});

test("a long org name truncates inside the action, which stays one line and names it whole", async ({
  page,
}) => {
  const name = "Cooperativa Agroindustrial de Productores del Valle del Cauca";
  await installChoiceClock(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await armCapabilities(SPACES_OWNER_CAPS);
  await armChoice(
    ownerChoice({ orgs: [PERSONAL, INNOVA, { ...LA_FILA, name }] }),
  );
  await page.goto("/");

  const modal = choiceModal(page);
  await modal
    .getByRole("button", { name: "Next", exact: true })
    .tap({ timeout: 15_000 });
  await modal.getByRole("button", { name: CHOOSE }).tap();
  const keep = modal.getByRole("button", {
    name: `Keep ${name} on the free tier`,
    exact: true,
  });
  await expect(keep).toBeVisible();
  // Each piece of the label, or the box that clips it, against the pill.
  const fit = await keep.evaluate((button) => {
    const box = button.getBoundingClientRect();
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    const pieces: { text: string; inside: boolean }[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement as HTMLElement;
      const clipped = getComputedStyle(parent).overflow === "hidden";
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = clipped
        ? parent.getBoundingClientRect()
        : range.getBoundingClientRect();
      pieces.push({
        text: node.textContent ?? "",
        inside:
          rect.left >= box.left &&
          rect.right <= box.right &&
          rect.top >= box.top &&
          rect.bottom <= box.bottom,
      });
    }
    return {
      height: Math.round(box.height),
      overflow: button.scrollWidth - button.clientWidth,
      pieces,
    };
  });
  expect(fit).toEqual({
    height: 48,
    overflow: 0,
    pieces: [
      { text: "Keep ", inside: true },
      { text: name, inside: true },
      { text: " on the free tier", inside: true },
    ],
  });
});
