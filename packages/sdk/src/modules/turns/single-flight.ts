export interface Flight<R> {
  promise: Promise<R>;
  dirty: boolean;
}

export function joinInFlight<R>(
  inFlight: Map<string, Flight<R>>,
  key: string,
  run: () => Promise<R>,
): Promise<R> {
  const joined = inFlight.get(key);
  if (joined) {
    joined.dirty = true;
    return joined.promise;
  }
  const flight: Flight<R> = {
    promise: Promise.resolve() as Promise<R>,
    dirty: false,
  };
  flight.promise = (async () => {
    try {
      for (;;) {
        flight.dirty = false;
        const result = await run();
        if (!flight.dirty) return result;
      }
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, flight);
  return flight.promise;
}
