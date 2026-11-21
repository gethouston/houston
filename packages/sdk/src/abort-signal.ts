function timeoutError(): DOMException {
  return new DOMException("signal timed out", "TimeoutError");
}

export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(timeoutError()), ms);
  return controller.signal;
}

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

export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { name } = error as { name?: unknown };
  return name === "TimeoutError" || name === "AbortError";
}
