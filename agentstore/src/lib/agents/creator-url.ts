/**
 * Creator-link validation for the claim form (client-safe: pure, no DB).
 *
 * The store stores `creator.url` as an https-only URL (`creatorSchema` in the
 * contract). The claim form's Link field is optional free text typed by a
 * non-technical user, so we normalize before validating: a value with no scheme
 * ("mysite.com") gets `https://` prepended so it publishes cleanly, while a value
 * that carries a non-https scheme ("http://mysite.com") is rejected with an inline
 * hint instead of a misleading generic 400. Empty input is valid (field optional).
 */

import { creatorSchema } from "@houston/agentstore-contract";

const urlSchema = creatorSchema.shape.url;

/** True when the string already begins with a URL scheme (e.g. `https://`, `http://`). */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

export type CreatorUrlResult =
  | { ok: true; url: string | undefined }
  | { ok: false; error: string };

/**
 * Normalize + validate a free-text creator link.
 * - Empty/whitespace → `{ ok: true, url: undefined }` (the field is optional).
 * - Scheme-less input → `https://` is prepended before validation.
 * - Anything that still fails the https-only rule → `{ ok: false, error }`.
 */
export function normalizeCreatorUrl(raw: string): CreatorUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: undefined };

  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  const result = urlSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, error: "Enter a valid link that starts with https://" };
  }
  return { ok: true, url: result.data };
}

/** Friendly message for a PATCH publish failure, keyed on the response error code. */
export function publishErrorMessage(
  code: string | undefined,
  status: number,
): string {
  switch (code) {
    case "rate_limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "unauthorized":
      return "Your claim link is no longer valid. Open the original link again.";
    case "not_found":
      return "We could not find this agent. Open your claim link again.";
    case "slug_exhausted":
      return "We could not create a public link for this name. Try a different creator name.";
    default:
      return `Publishing failed (${status}). Please try again.`;
  }
}
