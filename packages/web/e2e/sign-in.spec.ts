/**
 * GCIP (Firebase Auth) sign-in screen.
 *
 * Runs under the `auth` Playwright project, whose vite server bakes a (fake)
 * Firebase API key so `isIdentityConfigured()` is true and `App.tsx` renders
 * `SignInScreen` (the default server bakes no key, so the rest of the suite boots
 * straight to the shell). See playwright.config.ts + e2e/config.ts.
 *
 * The desktop-only OAuth loopback dance (Google/Microsoft system-browser + PKCE)
 * has node:test coverage in app/tests/identity-*.test.ts and cannot be driven in
 * a browser, so here the OAuth buttons are only asserted-rendered, never clicked.
 * The passwordless email-OTP path IS fully in-app, so it's driven end to end
 * against a MOCKED gateway (identity/otp.ts contract):
 *   POST /v1/auth/email-otp/start  → 204
 *   POST /v1/auth/email-otp/verify → 200 {customToken} | 401 (invalid) | 429 (rate)
 */
import { expect, test } from "./support/fixtures";

/** Mock the gateway OTP `start` endpoint (always succeeds → advances to code). */
async function mockOtpStart(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/v1/auth/email-otp/start", (route) =>
    route.fulfill({ status: 204 }),
  );
}

/** Mock the gateway OTP `verify` endpoint with a fixed HTTP status. */
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

/**
 * Seed the device-local last-sign-in hint BEFORE the app boots, so SignInScreen
 * renders the returning-user "continue" path. Mirrors lib/last-sign-in.ts's
 * storage key + versioned shape.
 */
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

/**
 * The pin input's REAL `<input>` (input-otp overlays an invisible input on the
 * six rendered slot boxes). Filling it distributes digits across the slots;
 * the sixth digit auto-submits via `onComplete`.
 */
function codeInput(page: import("@playwright/test").Page) {
  return page.locator('input[data-slot="input-otp"]');
}

test.describe("sign-in screen (GCIP)", () => {
  test.beforeEach(async ({ page }) => {
    await mockOtpStart(page);
    await page.goto("/");
    // SignInScreen has mounted once the primary OAuth button is visible.
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
    // The passwordless email method: an address field + its send button.
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
  });

  test("email and code fields use the light foreground", async ({ page }) => {
    // The sign-in card is a plain white card on the flat first-run background,
    // pinned light (FirstRunScreen), so its ink is the LIGHT --ht-ink #14161d.
    const emailInput = page.getByPlaceholder("you@example.com");
    await emailInput.fill("pilot@example.com");
    await expect(emailInput).toHaveCSS("color", "rgb(20, 22, 29)");

    await page.getByRole("button", { name: "Send code" }).click();
    // Three digits only — a sixth would auto-submit and leave the code step.
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
    // The code step: six pin boxes + the confirmation copy naming the email.
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
    // The sixth digit auto-submits — no button click needed.
    await codeInput(page).fill("000000");
    await expect(
      page.getByText(
        "That code is wrong or expired. Request a new one and try again.",
      ),
    ).toBeVisible();
    // The rejected code stays editable and the manual retry stays live.
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
    // The prominent continue button carries the full stored address in its
    // name, distinguishing it from the plain "Continue with Google" pill below.
    await expect(
      page.getByRole("button", { name: /^Continue with Google \(/ }),
    ).toBeVisible();
    await expect(page.getByText("jane@gethouston.ai")).toBeVisible();
    // The pills + email form stay below the "another way" divider.
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
    // One click lands straight on the 6-digit entry, naming the stored
    // email the code was sent to.
    await expect(page.locator('[data-slot="input-otp-slot"]')).toHaveCount(6);
    await expect(
      page.getByText("We sent a 6-digit code to pilot@example.com"),
    ).toBeVisible();
  });
});
