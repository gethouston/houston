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
