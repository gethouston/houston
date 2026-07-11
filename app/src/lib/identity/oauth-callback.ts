// Pure parser for the OAuth loopback callback URL the Rust shell forwards.
//
// The desktop loopback (app/src-tauri/src/oauth_loopback.rs) emits an
// `auth://deep-link` event carrying `houston://auth-callback?<query>` after the
// provider redirects the system browser back. This module turns that payload
// into the authorization `code`, VALIDATING the CSRF `state` and surfacing any
// provider-returned `error` as a typed `IdentityError`. Pure (no Tauri, no
// network) so it is unit-testable and the desktop-oauth driver stays thin.

import { IdentityError } from "./errors.ts";

/**
 * Extract the authorization `code` from a callback payload, enforcing the CSRF
 * `state`. Throws `IdentityError("invalid_idp_response")` on a provider error,
 * a state mismatch (possible forgery), or a missing code — never returns a
 * value the caller cannot trust.
 */
export function parseCallbackUrl(
  payload: string,
  expectedState: string,
): string {
  let url: URL;
  try {
    url = new URL(payload);
  } catch (e) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "unparseable_callback",
      cause: e,
    });
  }
  // OAuth errors can land in the query (code flow) or the fragment (some Entra
  // paths); check both. The loopback forwards the query, but stay tolerant.
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : "",
  );
  const errorParam =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    fragment.get("error_description") ||
    fragment.get("error");
  if (errorParam) {
    throw new IdentityError("invalid_idp_response", { rawCode: errorParam });
  }

  const state = url.searchParams.get("state") ?? fragment.get("state");
  if (state !== expectedState) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "state_mismatch",
    });
  }

  const code = url.searchParams.get("code") ?? fragment.get("code");
  if (!code) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "missing_code",
    });
  }
  return code;
}
