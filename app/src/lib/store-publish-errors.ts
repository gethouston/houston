/**
 * Turns an Agent Store publish/update failure into copy a non-technical user
 * can act on. The store answers PATCH/POST failures with snake_case machine
 * codes in the `error` field (`cannot_publish_archived`, `rate_limited`, ...);
 * the host forwards that body verbatim on `HoustonEngineError.body`. Showing a
 * bare code as toast text breaks the product rule against raw codes, so we map
 * every known code to a localized message and only ever pass a store `error`
 * through untranslated when it is genuine prose (a real sentence), never a
 * bare code. Unknown codes fall back to the generic message.
 */

/** Store machine code -> the i18n key that carries its human message. */
export const STORE_ERROR_MESSAGE_KEYS = {
  cannot_publish_archived: "publish.errors.codes.cannotPublishArchived",
  invalid_creator: "publish.errors.codes.invalidCreator",
  conflicting_ops: "publish.errors.codes.conflictingOps",
  slug_exhausted: "publish.errors.codes.slugExhausted",
  rate_limited: "publish.errors.codes.rateLimited",
  secrets_detected: "publish.errors.codes.secretsDetected",
  not_found: "publish.errors.codes.notFound",
} as const;

export type StoreErrorCode = keyof typeof STORE_ERROR_MESSAGE_KEYS;
export type StoreErrorMessageKey =
  (typeof STORE_ERROR_MESSAGE_KEYS)[StoreErrorCode];

/**
 * How to render a store failure: a localized message key for a known code,
 * verbatim prose the store supplied, or `null` to fall back to generic copy.
 */
export type StorePublishErrorResolution =
  | { kind: "key"; key: StoreErrorMessageKey }
  | { kind: "text"; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** True for a bare snake_case machine code (no spaces, no sentence casing). */
const looksLikeMachineCode = (s: string): boolean =>
  /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(s.trim());

/** Reads the store's `error` field off a HoustonEngineError-shaped throwable. */
function storeErrorDetail(err: unknown): unknown {
  if (!isRecord(err)) return null;
  const body = err.body;
  if (!isRecord(body)) return null;
  return "error" in body ? body.error : null;
}

export function classifyStorePublishError(
  err: unknown,
): StorePublishErrorResolution | null {
  const detail = storeErrorDetail(err);
  if (detail === null || detail === undefined) return null;

  if (typeof detail === "string") {
    const key = STORE_ERROR_MESSAGE_KEYS[detail as StoreErrorCode];
    if (key) return { kind: "key", key };
    // Unknown string: surface genuine prose, but never a raw machine code.
    return looksLikeMachineCode(detail) ? null : { kind: "text", text: detail };
  }

  // Structured host errors carry a human `message`; pass real prose through.
  if (isRecord(detail) && typeof detail.message === "string") {
    const text = detail.message.trim();
    if (text && !looksLikeMachineCode(text)) return { kind: "text", text };
  }
  return null;
}
