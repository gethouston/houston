/**
 * Pure decision logic behind the shared query-error toast (`useQueryErrorToast`).
 * Framework-free — no React, no toast/error-toast import chain — so the
 * once-per-distinct-failure + reset-on-recovery semantics AND the
 * empty-catalog-counts-as-failure rule are unit-testable directly (the same
 * split as `migration-reconnect-trigger.ts`).
 */

/**
 * Decide whether a failing query should raise a toast right now, given the
 * identity we last reported.
 *
 * - Not failing → nothing to report; clear the reported identity so the NEXT
 *   failure (even one that reuses the same identity value) toasts again.
 * - Failing with the identity we already reported → stay silent (a background
 *   refetch loop, StrictMode double-render, or unrelated re-render must not spam).
 * - Failing with a new identity → toast once and remember it.
 */
export function nextErrorToastState(
  prevReported: unknown,
  isFailure: boolean,
  errorIdentity: unknown,
): { shouldToast: boolean; reported: unknown } {
  if (!isFailure) return { shouldToast: false, reported: null };
  if (prevReported === errorIdentity)
    return { shouldToast: false, reported: errorIdentity };
  return { shouldToast: true, reported: errorIdentity };
}

/**
 * Stable sentinel identity for the "host returned an empty catalog" failure. A
 * healthy host never answers `[]` (local ~35 providers, cloud exactly 3), so an
 * empty 200 is a real failure that must reach the user — but it carries no error
 * object, so the once-per-occurrence toast keys on this shared reference.
 */
export const EMPTY_CATALOG_FAILURE = Object.freeze({
  reason: "empty-provider-catalog",
});

/**
 * Derive whether the provider-catalog query counts as a failure and, if so, the
 * identity the toast dedupes on. Two failure sources funnel into the SAME toast
 * path: a real query error (identity = the error) and a 200 with an empty payload
 * (identity = the shared sentinel).
 */
export function deriveCatalogFailure(input: {
  isError: boolean;
  error: unknown;
  isSuccess: boolean;
  count: number;
}): { isFailure: boolean; identity: unknown } {
  if (input.isError) return { isFailure: true, identity: input.error };
  if (input.isSuccess && input.count === 0)
    return { isFailure: true, identity: EMPTY_CATALOG_FAILURE };
  return { isFailure: false, identity: null };
}
