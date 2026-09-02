import { AUTH_WEB_URL } from "../config";
import { expect, test } from "../support/fixtures";

/**
 * The cloud sign-in screen on a phone viewport (the tier-1 CI gate's first
 * leg). Runs in the `mobile` project but against the identity-ON server (the
 * same one the desktop `auth` project uses), so `SignInScreen` renders. The
 * full OTP contract is driven by the desktop sign-in spec; here the gate is
 * usability at 412px — everything reachable, the code row inside the
 * viewport, no horizontal overflow.
 */

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

  // The email path: field + send stay reachable, and the six-slot code row
  // fits the phone card (it used to overflow the p-8 desktop paddings).
  await page.getByPlaceholder("you@example.com").fill("pilot@example.com");
  await page.getByRole("button", { name: "Send code" }).tap();
  const codeInput = page.locator('input[data-slot="input-otp"]');
  await expect(codeInput).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});
