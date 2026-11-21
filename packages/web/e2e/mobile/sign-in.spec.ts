import { AUTH_WEB_URL } from "../config";
import { expect, test } from "../support/fixtures";

test.use({ baseURL: AUTH_WEB_URL });

test("sign-in is usable at a phone width through to the code entry", async ({
  page,
}) => {
  await page.route("**/v1/auth/email-otp/start", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  const overflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByPlaceholder("you@example.com").fill("pilot@example.com");
  await page.getByRole("button", { name: "Send code" }).tap();
  const codeInput = page.locator('input[data-slot="input-otp"]');
  await expect(codeInput).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("each provider is a full-width 44px row at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const field = page.getByPlaceholder("you@example.com");
  await expect(field).toBeVisible();
  const providers = ["Google", "Apple", "Microsoft"].map((name) =>
    page.getByRole("button", { name: `Continue with ${name}` }),
  );
  const boxes = [];
  for (const button of providers) {
    await expect(button).toContainText("Continue with");
    const box = await button.boundingBox();
    if (!box) throw new Error("provider button not laid out");
    boxes.push(box);
  }
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBe(boxes[0]?.width);
  }
  expect(boxes[1]?.y).toBeGreaterThan((boxes[0]?.y ?? 0) + 43);
  const fieldBox = await field.boundingBox();
  expect(fieldBox?.height).toBeGreaterThanOrEqual(44);
});
