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
