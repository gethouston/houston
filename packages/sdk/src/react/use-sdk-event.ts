import { useEffect, useRef } from "react";
import type { HoustonSdk } from "../sdk";
import type { SdkEvent } from "../store";

/**
 * The slice of {@link HoustonSdk} an event binding reads from. See
 * {@link SnapshotSource} for why this is narrowed.
 */
export type EventSource = Pick<HoustonSdk, "on">;

/**
 * Subscribe to the global event channel, filter to a single `type`, and invoke
 * the current handler for each match. Returns the unsubscribe function.
 *
 * `getHandler` is read *per event*, not captured once, so a caller can swap the
 * handler (e.g. an inline closure that changes every render) without tearing
 * down and rebuilding the underlying subscription.
 */
export function subscribeToEvent(
  source: EventSource,
  type: string,
  getHandler: () => (event: SdkEvent) => void,
): () => void {
  return source.on((event) => {
    if (event.type === type) getHandler()(event);
  });
}

/**
 * Run `handler` for every SDK event whose `type` matches. The handler may be an
 * inline closure: its latest identity is held in a ref and read at dispatch
 * time, so only `[sdk, type]` drive (re)subscription — a changing handler never
 * churns the subscription.
 *
 * `handler` should not itself start renders synchronously in a way that assumes
 * a stable identity; it is a plain event callback. `event.data` is JSON — the
 * handler owns any narrowing of it.
 */
export function useSdkEvent(
  sdk: HoustonSdk,
  type: string,
  handler: (event: SdkEvent) => void,
): void {
  const handlerRef = useRef(handler);
  // Writing a ref during render is safe (it never feeds this render's output)
  // and keeps the dispatched handler current even for an event that fires
  // synchronously right after commit, before any effect could refresh it.
  handlerRef.current = handler;
  useEffect(
    () => subscribeToEvent(sdk, type, () => handlerRef.current),
    [sdk, type],
  );
}
