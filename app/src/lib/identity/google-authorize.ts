// Desktop Google sign-in: loopback+PKCE authorize → token exchange → id_token.
//
// Google "Desktop app" OAuth clients are non-confidential but STILL require the
// installed-app `client_secret` at the token endpoint, so both the client id
// and secret are baked as Vite defines (`__GOOGLE_DESKTOP_CLIENT_ID__` /
// `__GOOGLE_DESKTOP_CLIENT_SECRET__`). auth.ts (Wave B) feeds the returned
// id_token to `signInWithIdp({ providerId: "google.com" })`.

import {
  type LoopbackAuthorizeOptions,
  postTokenForm,
  runLoopbackAuthorize,
} from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

function googleClientId(): string {
  return typeof __GOOGLE_DESKTOP_CLIENT_ID__ !== "undefined"
    ? __GOOGLE_DESKTOP_CLIENT_ID__
    : "";
}

function googleClientSecret(): string {
  return typeof __GOOGLE_DESKTOP_CLIENT_SECRET__ !== "undefined"
    ? __GOOGLE_DESKTOP_CLIENT_SECRET__
    : "";
}

/**
 * Drive the desktop Google flow and return the OIDC id_token, or `null` when the
 * authorize was benignly cancelled (superseded / unmount / timeout).
 */
export async function authorizeGoogleDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<string | null> {
  const clientId = googleClientId();
  if (!clientId) {
    throw new IdentityError("operation_not_allowed", {
      rawCode: "google_desktop_client_id_missing",
    });
  }

  const authorized = await runLoopbackAuthorize(
    {
      authorizeBase: GOOGLE_AUTHORIZE,
      clientId,
      scope: "openid email profile",
    },
    opts,
  );
  if (!authorized) return null; // benign cancel
  const { code, redirectUri, codeVerifier } = authorized;

  const body = await postTokenForm(GOOGLE_TOKEN, {
    client_id: clientId,
    client_secret: googleClientSecret(),
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const idToken = body.id_token;
  if (typeof idToken !== "string" || idToken.length === 0) {
    throw new IdentityError("malformed_response", {
      rawCode: "google_token_missing_id_token",
    });
  }
  return idToken;
}
