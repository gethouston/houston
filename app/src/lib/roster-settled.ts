import type { StoreApi } from "zustand";

export interface RosterLoadState {
  loaded: boolean;
  loading: boolean;
}

export type Tripwire = (trip: () => void) => () => void;

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
