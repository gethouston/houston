/**
 * Pure decision for how an engine-call failure should be surfaced. Extracted
 * from `tauri.ts`'s `surfaceError` so it can be unit-tested without importing
 * the Tauri runtime.
 *
 * Two independent switches:
 *  - `toast`  — show the red error toast to the user.
 *  - `capture` — report the failure to Sentry.
 *
 * The no-silent-failures policy lives here: a caller that renders its OWN
 * failure UI passes `toast: false` (so `call`'s generic toast doesn't fire on
 * top of theirs), but the failure is STILL captured to Sentry. Suppressing the
 * toast must never suppress the report.
 */
export interface EngineCallSurface {
  toast: boolean;
  capture: boolean;
}

export interface EngineCallSurfaceOptions {
  /** Show a red error toast on failure. Default true. */
  toast?: boolean;
  /** Report the failure to Sentry. Default true. */
  capture?: boolean;
}

/**
 * Decide whether a failed engine call should toast and/or capture.
 *
 * @param errorName `err.name` of the caught error (`undefined` for non-Error
 *   throws). `"AbortError"` is treated as an expected cancellation (the user
 *   typed again, navigated away, or cancelled a sign-in) — never toasted, never
 *   captured.
 */
export function engineCallSurface(
  errorName: string | undefined,
  options?: EngineCallSurfaceOptions,
): EngineCallSurface {
  if (errorName === "AbortError") {
    return { toast: false, capture: false };
  }
  return {
    toast: options?.toast !== false,
    capture: options?.capture !== false,
  };
}
