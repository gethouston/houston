// The provider token-endpoint POST, shared by the Google (confidential
// installed-app secret) and Microsoft (public PKCE) code exchanges.
//
// Split out of desktop-oauth.ts — it is pure HTTP with no attempt lifecycle in
// it — so that module stays inside the 200-line limit. Every failure throws
// typed; nothing here is swallowed.

import { IdentityError } from "./errors.ts";

/**
 * POST a form body to a provider token endpoint and return the parsed JSON.
 */
export async function postTokenForm(
  url: string,
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
  } catch (e) {
    throw new IdentityError("network", { cause: e });
  }
  if (!res.ok) {
    // Best-effort extraction of the provider's error token for diagnostics;
    // we throw regardless (never swallow the failure).
    let rawCode: string | undefined;
    try {
      const err = (await res.json()) as { error?: unknown };
      if (typeof err.error === "string") rawCode = err.error;
    } catch {
      rawCode = undefined;
    }
    throw new IdentityError("invalid_idp_response", {
      httpStatus: res.status,
      rawCode,
    });
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch (e) {
    throw new IdentityError("malformed_response", {
      httpStatus: res.status,
      cause: e,
    });
  }
  if (typeof body !== "object" || body === null) {
    throw new IdentityError("malformed_response", { httpStatus: res.status });
  }
  return body as Record<string, unknown>;
}
