import type { StoreApi } from "zustand";

/** The agent store's load flags, all a roster wait reads. */
export interface RosterLoadState {
  loaded: boolean;
  loading: boolean;
}

/** Arms a watch that calls `trip` on a change; returns its disarm. */
export type Tripwire = (trip: () => void) => () => void;

/** Trips when `select` over the store yields a different value. */
export function onStoreChange<T, V>(
  store: Pick<StoreApi<T>, "getState" | "subscribe">,
  select: (state: T) => V,
): Tripwire {
  return (trip) => {
    const armedAt = select(store.getState());
    return store.subscribe((state) => {
      if (!Object.is(select(state), armedAt)) trip();
    });
  };
}

/**
 * Run `run` once the roster has settled: now when it already has, else on the
 * first write that settles it. Any tripwire firing first abandons the wait.
 * Returns a cancel, so a newer request can drop one still waiting.
 */
export function afterRosterSettles<S extends RosterLoadState>(
  store: Pick<StoreApi<S>, "getState" | "subscribe">,
  run: () => void,
  tripwires: readonly Tripwire[] = [],
): () => void {
  const settled = (s: RosterLoadState) => s.loaded && !s.loading;
  if (settled(store.getState())) {
    run();
    return () => {};
  }
  const disarms: (() => void)[] = [];
  const cancel = () => {
    for (const disarm of disarms.splice(0)) disarm();
  };
  disarms.push(
    store.subscribe((state) => {
      if (!settled(state)) return;
      cancel();
      run();
    }),
  );
  for (const arm of tripwires) disarms.push(arm(cancel));
  return cancel;
}
