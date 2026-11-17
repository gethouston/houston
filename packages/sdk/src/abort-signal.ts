/**
 * `AbortSignal.timeout` and `AbortSignal.any` for every webview Houston
 * supports. macOS 10.15 is the desktop minimum, and its system WebKit
 * (Safari 15) has neither: `timeout` needs Safari 16, `any` needs Safari 17.4,
 * so a direct call throws `undefined is not a function` before the request it
 * guards is even made. Each helper uses the native API when present.
 *
 * Dependency-free and erasable-syntax-only: the app's node:test entry points
 * load it through the `@houston/sdk/abort-signal` subpath.
 */

function timeoutError(): DOMException {
  return new DOMException("signal timed out", "TimeoutError");
}

/** A signal that aborts with a `TimeoutError` after `ms`. */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(timeoutError()), ms);
  return controller.signal;
}

/** A signal that aborts, with the same reason, as soon as any input does. */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([...signals]);
  }
  const controller = new AbortController();
  const settled = signals.find((s) => s.aborted);
  if (settled) {
    controller.abort(settled.reason);
    return controller.signal;
  }
  const onAbort = (event: Event) => {
    for (const s of signals) s.removeEventListener("abort", onAbort);
    controller.abort((event.target as AbortSignal).reason);
  };
  for (const s of signals) s.addEventListener("abort", onAbort);
  return controller.signal;
}

/** The abort a signal above raises (or a caller's own), whatever the runtime
 *  names it. */
export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name } = error as { name?: unknown };
  return name === "TimeoutError" || name === "AbortError";
}
