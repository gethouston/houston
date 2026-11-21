import { IdentityError, isIdentityError } from "./errors.ts";

const STATE_MISMATCH_RAW_CODE = "state_mismatch";

export function isCsrfStateMismatch(e: unknown): boolean {
  return (
    isIdentityError(e) &&
    e.code === "invalid_idp_response" &&
    e.rawCode === STATE_MISMATCH_RAW_CODE
  );
}

function validateCallback(
  payload: string,
  expectedState: string,
): { url: URL; fragment: URLSearchParams } {
  let url: URL;
  try {
    url = new URL(payload);
  } catch (e) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "unparseable_callback",
      cause: e,
    });
  }
  const fragment = new URLSearchParams(
    url.hash.startsWith("#") ? url.hash.slice(1) : "",
  );

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

  return { url, fragment };
}

export function parseCallbackUrl(
  payload: string,
  expectedState: string,
): string {
  const { url, fragment } = validateCallback(payload, expectedState);
  const code = url.searchParams.get("code") ?? fragment.get("code");
  if (!code) {
    throw new IdentityError("invalid_idp_response", {
      rawCode: "missing_code",
    });
  }
  return code;
}

export function parseCallbackQuery(
  payload: string,
  expectedState: string,
): string {
  const { url } = validateCallback(payload, expectedState);
  return url.search.startsWith("?") ? url.search.slice(1) : url.search;
}
