// Pure parser for the OAuth loopback callback URL the Rust shell forwards.
//
// The desktop loopback (app/src-tauri/src/oauth_loopback.rs) emits an
// `auth://deep-link` event carrying `houston://auth-callback?<query>` after the
// provider redirects the system browser back. This module turns that payload
// into the authorization `code`, VALIDATING the CSRF `state` and surfacing any
// provider-returned `error` as a typed `IdentityError`. Pure (no Tauri, no
// network) so it is unit-testable and the desktop-oauth driver stays thin.

import { IdentityError, isIdentityError } from "./errors.ts";

/** The `rawCode` a state-mismatch throw carries (a stale/foreign callback). */
const STATE_MISMATCH_RAW_CODE = "state_mismatch";

/**
 * True iff `e` is the CSRF-`state`-mismatch throw from `parseCallbackUrl`. The
 * await-wrapper uses this to IGNORE a stale/foreign callback (keep waiting)
 * rather than fail the in-flight attempt — matching on our own internal
 * `rawCode`, never a provider string.
 */
export function isCsrfStateMismatch(e: unknown): boolean {
  return (
    isIdentityError(e) &&
    e.code === "invalid_idp_response" &&
    e.rawCode === STATE_MISMATCH_RAW_CODE
  );
}

/**
 * Extract the authorization `code` from a callback payload, enforcing the CSRF
 * `state`. Throws `IdentityError("invalid_idp_response")` on a state mismatch
 * (checked first — a stale/foreign callback), a provider error, or a missing
 * code — never returns a value the caller cannot trust.
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
  // Callback fields can land in the query (code flow) or the fragment (some
  // Entra paths); check both. The loopback forwards the query, but stay tolerant.
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : "",
  );

  // Validate the CSRF `state` FIRST — before trusting any other field. A payload
  // that doesn't echo THIS attempt's state is a stale/foreign callback (all
  // attempts share one `auth://deep-link` channel), so its `error`/`code` must
  // never be acted on. The await-wrapper distinguishes this throw (via
  // `isCsrfStateMismatch`) and keeps waiting rather than failing the attempt.
  const state = url.searchParams.get("state") ?? fragment.get("state");
  if (state !== expectedState) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: STATE_MISMATCH_RAW_CODE,
    });
  }

  const errorParam =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    fragment.get("error_description") ||
    fragment.get("error");
  if (errorParam) {
    throw new IdentityError("invalid_idp_response", { rawCode: errorParam });
  }

  const code = url.searchParams.get("code") ?? fragment.get("code");
  if (!code) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "missing_code",
    });
  }
  return code;
}
