import { expect, type Page } from "@playwright/test";
import { AUTH_WEB_URL } from "../config";

export const E2E_VIEWER = {
  uid: "u-self",
  email: "you@acme.test",
  displayName: "Ada Lovelace",
  photoUrl: "https://img.test/ada.png",
} as const;

const OTP_CODE = "424242";
const REFRESH_TOKEN = "e2e-refresh-token";
const TOKEN_TTL_S = 3600;

const b64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function fakeIdToken(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: "RS256", typ: "JWT", kid: "e2e" }),
    b64url({
      sub: E2E_VIEWER.uid,
      user_id: E2E_VIEWER.uid,
      email: E2E_VIEWER.email,
      email_verified: true,
      name: E2E_VIEWER.displayName,
      picture: E2E_VIEWER.photoUrl,
      aud: "gethouston",
      iss: "https://securetoken.google.com/gethouston",
      auth_time: now,
      iat: now,
      exp: now + TOKEN_TTL_S,
      firebase: { sign_in_provider: "custom", identities: {} },
    }),
    "e2e-signature",
  ].join(".");
}

async function mockIdentityBackend(page: Page): Promise<void> {
  const idToken = fakeIdToken();

  await page.route("**/v1/auth/email-otp/start", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/v1/auth/email-otp/verify", (route) =>
    route.fulfill({ status: 200, json: { customToken: "e2e-custom-token" } }),
  );

  await page.route("**identitytoolkit.googleapis.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("accounts:signInWithCustomToken")) {
      return route.fulfill({
        json: {
          idToken,
          refreshToken: REFRESH_TOKEN,
          expiresIn: String(TOKEN_TTL_S),
          localId: E2E_VIEWER.uid,
          isNewUser: false,
        },
      });
    }
    if (url.includes("accounts:lookup")) {
      return route.fulfill({
        json: {
          kind: "identitytoolkit#GetAccountInfoResponse",
          users: [
            {
              localId: E2E_VIEWER.uid,
              email: E2E_VIEWER.email,
              emailVerified: true,
              displayName: E2E_VIEWER.displayName,
              photoUrl: E2E_VIEWER.photoUrl,
              providerUserInfo: [
                {
                  providerId: "password",
                  federatedId: E2E_VIEWER.email,
                  email: E2E_VIEWER.email,
                  displayName: E2E_VIEWER.displayName,
                  photoUrl: E2E_VIEWER.photoUrl,
                },
              ],
              validSince: "0",
              createdAt: "0",
              lastLoginAt: "0",
            },
          ],
        },
      });
    }
    return route.fulfill({
      status: 500,
      json: { error: { message: `UNMOCKED_IDENTITY_CALL ${url}` } },
    });
  });

  await page.route("**securetoken.googleapis.com/**", (route) =>
    route.fulfill({
      json: {
        access_token: idToken,
        id_token: idToken,
        refresh_token: REFRESH_TOKEN,
        expires_in: String(TOKEN_TTL_S),
        token_type: "Bearer",
        user_id: E2E_VIEWER.uid,
        project_id: "gethouston",
      },
    }),
  );
}

export async function signInAsViewer(
  page: Page,
  opts?: {
    shellTimeout?: number;
  },
): Promise<void> {
  await mockIdentityBackend(page);
  await page.goto(`${AUTH_WEB_URL}/`);

  await page.getByPlaceholder("you@example.com").fill(E2E_VIEWER.email);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.locator('input[data-slot="input-otp"]').fill(OTP_CODE);

  await expect(
    page
      .locator('[data-tour-target="newMission"]')
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout: opts?.shellTimeout ?? 20_000 });
}

export { AUTH_WEB_URL };
