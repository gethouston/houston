import { expect, test } from "./support/fixtures";

async function mockOtpStart(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/v1/auth/email-otp/start", (route) =>
    route.fulfill({ status: 204 }),
  );
}

async function mockOtpVerify(
  page: import("@playwright/test").Page,
  status: number,
  body?: unknown,
): Promise<void> {
  await page.route("**/v1/auth/email-otp/verify", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body ?? {}),
    }),
  );
}

async function seedLastSignIn(
  page: import("@playwright/test").Page,
  provider: string,
  email: string,
): Promise<void> {
  await page.addInitScript(
    ([p, e]) => {
      window.localStorage.setItem(
        "houston.last-sign-in",
        JSON.stringify({ v: 1, provider: p, email: e }),
      );
    },
    [provider, email] as const,
  );
}

async function submitEmail(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
}

function codeInput(page: import("@playwright/test").Page) {
  return page.locator('input[data-slot="input-otp"]');
}

test.describe("sign-in screen (GCIP)", () => {
  test.beforeEach(async ({ page }) => {
    await mockOtpStart(page);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });

  test("renders all four sign-in methods", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Apple" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Microsoft" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
  });

  test("email and code fields use the light foreground", async ({ page }) => {
    const emailInput = page.getByPlaceholder("you@example.com");
    await emailInput.fill("pilot@example.com");
    await expect(emailInput).toHaveCSS("color", "rgb(20, 22, 29)");

    await page.getByRole("button", { name: "Send code" }).click();
    await codeInput(page).fill("123");
    await expect(
      page.locator('[data-slot="input-otp-slot"]').first(),
    ).toHaveText("1");
    await expect(
      page.locator('[data-slot="input-otp-slot"]').first(),
    ).toHaveCSS("color", "rgb(20, 22, 29)");
  });

  test("email entry advances to the 6-digit code screen", async ({ page }) => {
    await submitEmail(page, "pilot@example.com");
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    await expect(
      page.getByText("We sent a 6-digit code to pilot@example.com"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verify code" }),
    ).toBeVisible();
  });

  test("surfaces a wrong/expired code (otp_invalid_code)", async ({ page }) => {
    await mockOtpVerify(page, 401);
    await submitEmail(page, "pilot@example.com");
    await codeInput(page).fill("000000");
    await expect(
      page.getByText(
        "That code is wrong or expired. Request a new one and try again.",
      ),
    ).toBeVisible();
    await expect(codeInput(page)).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Verify code" }),
    ).toBeEnabled();
  });

  test("surfaces rate limiting (otp_rate_limited)", async ({ page }) => {
    await mockOtpVerify(page, 429);
    await submitEmail(page, "pilot@example.com");
    await codeInput(page).fill("000000");
    await expect(
      page.getByText("Too many attempts. Wait a minute, then try again."),
    ).toBeVisible();
  });
});

test.describe("returning user (last sign-in continue)", () => {
  test.beforeEach(async ({ page }) => {
    await mockOtpStart(page);
  });

  test("leads with a one-click continue for the last OAuth account", async ({
    page,
  }) => {
    await seedLastSignIn(page, "google.com", "jane@gethouston.ai");
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: /^Continue with Google \(/ }),
    ).toBeVisible();
    await expect(page.getByText("jane@gethouston.ai")).toBeVisible();
    await expect(page.getByText("or use another way")).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  });

  test("email continue prefills the stored address and sends the code", async ({
    page,
  }) => {
    await seedLastSignIn(page, "password", "pilot@example.com");
    await page.goto("/");
    await page
      .getByRole("button", { name: /^Continue with your email \(/ })
      .click();
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    await expect(
      page.getByText("We sent a 6-digit code to pilot@example.com"),
    ).toBeVisible();
  });
});

test("a fresh browser lands on sign-in, never the language gate", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.removeItem("houston.pref.locale");
  });
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(page.getByText("Choose your language")).toHaveCount(0);
  await expect(page.getByText("Elige tu idioma")).toHaveCount(0);
});
