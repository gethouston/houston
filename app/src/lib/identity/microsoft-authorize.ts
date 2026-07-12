// Desktop Microsoft sign-in: loopback+PKCE authorize → PUBLIC-client token
// exchange (NO client_secret) → id_token and/or access_token.
//
// Uses the `common` tenant so both work and personal Microsoft accounts sign
// in, with `prompt=select_account` so a shared machine can switch accounts and
// `offline_access` so a refresh token is issued. auth.ts (Wave B) feeds the
// id_token to `signInWithIdp({ providerId: "microsoft.com" })`, falling back to
// the access_token when no id_token is returned.

import {
  type LoopbackAuthorizeOptions,
  postTokenForm,
  runLoopbackAuthorize,
} from "./desktop-oauth.ts";
import { IdentityError } from "./errors.ts";

const MS_AUTHORIZE =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MS_SCOPE = "openid email profile offline_access";

function microsoftClientId(): string {
  return typeof __MICROSOFT_DESKTOP_CLIENT_ID__ !== "undefined"
    ? __MICROSOFT_DESKTOP_CLIENT_ID__
    : "";
}

/**
 * Drive the desktop Microsoft flow. Returns whichever credential Entra minted,
 * or `null` when the authorize was benignly cancelled (superseded / unmount /
 * timeout).
 */
export async function authorizeMicrosoftDesktop(
  opts?: LoopbackAuthorizeOptions,
): Promise<{ idToken?: string; accessToken?: string } | null> {
  const clientId = microsoftClientId();
  if (!clientId) {
    // No baked MS client id for this build — surface it, never a silent no-op.
    throw new IdentityError("operation_not_allowed", {
      rawCode: "microsoft_desktop_client_id_missing",
    });
  }

  const authorized = await runLoopbackAuthorize(
    {
      authorizeBase: MS_AUTHORIZE,
      clientId,
      scope: MS_SCOPE,
      extraParams: { prompt: "select_account" },
    },
    opts,
  );
  if (!authorized) return null; // benign cancel
  const { code, redirectUri, codeVerifier } = authorized;

  const body = await postTokenForm(MS_TOKEN, {
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: MS_SCOPE,
  });

  const idToken =
    typeof body.id_token === "string" && body.id_token.length > 0
      ? body.id_token
      : undefined;
  const accessToken =
    typeof body.access_token === "string" && body.access_token.length > 0
      ? body.access_token
      : undefined;
  if (!idToken && !accessToken) {
    throw new IdentityError("malformed_response", {
      rawCode: "microsoft_token_missing_credential",
    });
  }
  return { idToken, accessToken };
}
