/**
 * Sign the harness in as a known user.
 *
 * Most specs run on the identity-OFF vite server (no baked Firebase key), where
 * `isIdentityConfigured()` is false and the app boots straight to the shell with
 * a null session. That is enough for almost everything — but NOT for the
 * surfaces gated on a signed-in identity (`useOrgPeople`, `useUserProfiles`),
 * which never even fetch when identity is unconfigured, and not for anything
 * that must know WHO is looking (`currentUserId` → the @mention self-chip).
 *
 * So this drives the identity-ON server (`AUTH_WEB_URL`, the same one the
 * sign-in spec uses) through its REAL passwordless email flow, with only the
 * NETWORK mocked:
 *   - the gateway's OTP contract (`/v1/auth/email-otp/{start,verify}`), exactly
 *     as `sign-in.spec.ts` mocks it, ending in a custom token;
 *   - GCIP's public REST wire (`identitytoolkit` / `securetoken`), so
 *     firebase-js-sdk completes `signInWithCustomToken` + `accounts:lookup`
 *     offline and emits a real SDK session.
 *
 * Nothing here reaches into the SDK's storage internals: the app signs in
 * through its own UI, and the browser ends up holding a genuine Firebase user
 * whose uid is {@link E2E_VIEWER}`.uid`.
 */

import { expect, type Page } from "@playwright/test";
import { AUTH_WEB_URL } from "../config";

/** The signed-in viewer. Its `uid` is what `useSession().uid` resolves to, so a
 *  spec can arm the same id on the fake host's org roster and assert "me". */
export const E2E_VIEWER = {
  uid: "u-self",
  email: "you@acme.test",
  displayName: "Ada Lovelace",
  photoUrl: "https://img.test/ada.png",
} as const;

/** Any 6 digits: the OTP verify call is mocked, never checked. */
const OTP_CODE = "424242";
const REFRESH_TOKEN = "e2e-refresh-token";
/** GCIP's own TTL for a minted ID token; the JWT below carries the same one. */
const TOKEN_TTL_S = 3600;

const b64url = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * An unsigned but structurally real Firebase ID token. The client never
 * verifies a signature (the gateway does, against Google's JWKS) — it only
 * DECODES the payload for `sub` / `email` / `exp` (`lib/identity/id-token.ts`),
 * so a decodable payload is exactly what the app needs.
 */
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

/** Mock every identity network call the sign-in makes. */
async function mockIdentityBackend(page: Page): Promise<void> {
  const idToken = fakeIdToken();

  // The gateway's OTP contract (identity/otp.ts): start always succeeds, verify
  // hands back the custom token firebase then exchanges.
  await page.route("**/v1/auth/email-otp/start", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.route("**/v1/auth/email-otp/verify", (route) =>
    route.fulfill({ status: 200, json: { customToken: "e2e-custom-token" } }),
  );

  // GCIP REST. An unmocked call is a harness gap, so it fails loudly instead of
  // escaping to the real Google endpoint.
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

  // Proactive token refresh. The minted token lives an hour, so this should
  // never fire inside a test — it answers correctly if it ever does.
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

/**
 * Boot the identity-ON server and sign {@link E2E_VIEWER} in through the app's
 * own passwordless email screen. Resolves once the shell is on screen.
 *
 * Pair it with `test.use({ baseURL: AUTH_WEB_URL })` so every later `goto`,
 * and the app's own gateway calls, stay on that server.
 */
export async function signInAsViewer(
  page: Page,
  opts?: {
    /** Budget for the post-sign-in shell to appear. global-setup's warm-up
     *  passes a cold-compile-sized one; specs keep the default (the shell
     *  graph is warm by the time any spec runs). */
    shellTimeout?: number;
  },
): Promise<void> {
  await mockIdentityBackend(page);
  await page.goto(`${AUTH_WEB_URL}/`);

  await page.getByPlaceholder("you@example.com").fill(E2E_VIEWER.email);
  await page.getByRole("button", { name: "Send code" }).click();
  // The sixth digit auto-submits (input-otp `onComplete`).
  await page.locator('input[data-slot="input-otp"]').fill(OTP_CODE);

  // The shell is up once its header actions are (the same anchor chat.spec.ts
  // uses to open a mission).
  await expect(page.locator('[data-tour-target="newMission"]')).toBeVisible({
    timeout: opts?.shellTimeout ?? 20_000,
  });
}

/** The identity-ON server this helper drives. Re-exported so a spec's
 *  `test.use({ baseURL })` and this module can never disagree. */
export { AUTH_WEB_URL };
