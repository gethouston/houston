/**
 * A same-tick re-entry latch for one async action.
 *
 * A React state flag (`installing`) only reaches the button's `disabled` on the
 * NEXT render, so every click of a rage burst lands in the same tick, passes
 * that check, and runs the action again — two agents from one install. This
 * latch flips synchronously on call, which is what actually closes that window.
 * It releases when the action settles, rejection included, so a failed attempt
 * never latches the surface shut.
 */
export function createSingleFlight() {
  let inFlight = false;
  return async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight) return undefined;
    inFlight = true;
    try {
      return await action();
    } finally {
      inFlight = false;
    }
  };
}
