const STAY_OPEN = Symbol.for("houston.formDialog.stayOpen");

export function stayOpen(): Promise<never> {
  const signal = new Error("form dialog stays open") as Error &
    Record<symbol, unknown>;
  signal[STAY_OPEN] = true;
  return Promise.reject(signal);
}

export function isStayOpenSignal(reason: unknown): boolean {
  return (
    !!reason &&
    typeof reason === "object" &&
    (reason as Record<symbol, unknown>)[STAY_OPEN] === true
  );
}
