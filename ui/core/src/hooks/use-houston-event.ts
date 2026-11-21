"use client";

import { useEffect } from "react";

interface TauriEvent<T> {
  payload: T;
}

type ListenFn = <T>(
  event: string,
  handler: (event: TauriEvent<T>) => void,
) => Promise<() => void>;

interface TauriEventModule {
  listen: ListenFn;
}

function importTauriEvents(): Promise<TauriEventModule | null> {
  const mod = ["@tauri-apps", "api", "event"].join("/");
  return import(/* @vite-ignore */ mod).catch(() => null);
}

export function useHoustonEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    importTauriEvents()
      .then((tauriEvents) => {
        if (!tauriEvents || cancelled) return null;
        return tauriEvents.listen<T>(eventName, (event) =>
          handler(event.payload),
        );
      })
      .then((fn) => {
        if (!fn) return;
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [eventName, handler]);
}
