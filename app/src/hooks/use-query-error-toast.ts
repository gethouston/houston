import { useEffect, useRef } from "react";
import { showErrorToast } from "../lib/error-toast";
import { nextErrorToastState } from "./query-error-toast-state.ts";

/**
 * Surface a failing query as a single user-facing toast (+ Sentry report),
 * exactly once per distinct failure identity, resetting when the query recovers.
 *
 * `isFailure` + `errorIdentity` are derived by the caller so this covers more
 * than a raw `query.isError`: a query that resolves 200 but with a payload the
 * caller treats as a failure (e.g. an empty provider catalog) flows through the
 * same path by passing a stable sentinel as the identity. `errorIdentity` is
 * also forwarded to `showErrorToast` as the original error for the Sentry report.
 *
 * Extracted from the verbatim ref-guarded effect that `useProviderCatalog` and
 * `useCapabilities` each carried, so the dedupe semantics live in one place; the
 * pure decision (`nextErrorToastState`) is unit-tested framework-free.
 */
export function useQueryErrorToast(
  isFailure: boolean,
  errorIdentity: unknown,
  tag: string,
  message: string,
): void {
  const reported = useRef<unknown>(null);
  useEffect(() => {
    const { shouldToast, reported: next } = nextErrorToastState(
      reported.current,
      isFailure,
      errorIdentity,
    );
    reported.current = next;
    if (shouldToast) showErrorToast(tag, message, errorIdentity);
  }, [isFailure, errorIdentity, tag, message]);
}
