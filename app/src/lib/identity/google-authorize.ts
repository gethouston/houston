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
      extraParams: { access_type: "offline" },
    },
    opts,
  );
  if (!authorized) return null;
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
