/**
 * Per-document write serialization for the typed `.houston` families.
 *
 * Every mutation of a whole-file JSON doc (activities, routines) is a
 * load → modify → save: two concurrent requests for the same agent both load
 * the same base list and the last save silently drops the other's entry. This
 * is not theoretical — a double-fired first-message submit created two
 * missions ~70ms apart and the losing create's board entry vanished, leaving
 * its (fully persisted) conversation unreachable in the UI.
 *
 * Same chain-of-promises shape as the runtime's `withWorkdirLock`: same-key
 * writers queue, different keys never contend, a rejection propagates to its
 * caller but never wedges the chain. In-process serialization is sufficient —
 * this host process is the only writer of a given agent's docs.
 */

const chains = new Map<string, Promise<void>>();

export function withDocLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const run = prev.then(fn);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(key, settled);
  // Drop the entry once this run is the tail and done, so the map never
  // accumulates one promise per doc the process ever touched.
  void settled.then(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });
  return run;
}
