/**
 * Per-document write serialization for the typed `.houston` families.
 *
 * Every mutation of a whole-file JSON doc (preferences, activities, routines)
 * is a load → modify → save: two concurrent writers for the same doc both load
 * the same base and the last save silently drops the other's edit. This is not
 * theoretical — a double-fired first-message submit created two missions ~70ms
 * apart and the losing create's board entry vanished, leaving its (fully
 * persisted) conversation unreachable in the UI.
 *
 * Same chain-of-promises shape as the runtime's `withWorkdirLock`: same-key
 * writers queue, different keys never contend, a rejection propagates to its
 * caller but never wedges the chain. In-process serialization is sufficient —
 * one process is the only writer of a given doc.
 *
 * It lives in the domain package because both levels of the stack lock the same
 * documents — the domain writers (`setPreference`) and the host routes that
 * wrap a multi-step read-modify-write — and two registries keyed the same way
 * would not serialize against each other at all. A holder must never call code
 * that takes the SAME key: the chain is not reentrant.
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
