import { useCallback, useEffect, useState } from "react";
import { tauriPreferences } from "../lib/tauri";

const TIMEZONE_KEY = "timezone";

export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.length) return tz;
  } catch {
    // fall through
  }
  return "UTC";
}

interface CachedState {
  value: string | null;
  loaded: boolean;
}

let cache: CachedState = { value: null, loaded: false };
let inflight: Promise<string | null> | null = null;
const subscribers = new Set<(v: string | null) => void>();

function notify() {
  for (const fn of subscribers) fn(cache.value);
}

async function fetchOnce(): Promise<string | null> {
  if (cache.loaded) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const stored = await tauriPreferences.get(TIMEZONE_KEY);
      let value = stored && stored.trim() ? stored : null;

      // Auto-seed: if the user has never set a timezone, save their
      // browser-detected one silently. Previously we showed a full-page
      // "What's your timezone?" gate that blocked the Routines tab. The
      // detected zone is almost always correct; users who need to change
      // it later do so from the timezone picker in the Routines editor.
      if (!value) {
        const detected = detectTimezone();
        try {
          await tauriPreferences.set(TIMEZONE_KEY, detected);
          value = detected;
        } catch {
          // If persisting fails, fall back to the detected value in memory
          // so the UI still has something to render a cron schedule against.
          value = detected;
        }
      }

      cache = { value, loaded: true };
      notify();
      return cache.value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function setTimezonePreference(tz: string): Promise<void> {
  await tauriPreferences.set(TIMEZONE_KEY, tz);
  cache = { value: tz, loaded: true };
  notify();
}

export interface TimezoneState {
  /** Persisted IANA value, or `null` while loading or unconfirmed. */
  timezone: string | null;
  /** True once we've checked the engine — false during the first roundtrip. */
  loaded: boolean;
  /** The browser-detected zone, used as a default when prompting the user. */
  detected: string;
  /** Persist a new value and broadcast to all subscribers. */
  confirm: (tz: string) => Promise<void>;
}

/**
 * Returns the user's IANA timezone. On first call we auto-save the
 * browser-detected zone, so `timezone` is non-null from the first render
 * onwards (no "timezone gate" UX). Users can change it later from the
 * timezone picker in the Routines editor.
 */
export function useTimezonePreference(): TimezoneState {
  const [, force] = useState(0);

  useEffect(() => {
    const sub = () => force((n) => n + 1);
    subscribers.add(sub);
    fetchOnce().catch((e) => console.error("[timezone] load failed:", e));
    return () => {
      subscribers.delete(sub);
    };
  }, []);

  const confirm = useCallback(async (tz: string) => {
    await setTimezonePreference(tz);
  }, []);

  return {
    timezone: cache.value,
    loaded: cache.loaded,
    detected: detectTimezone(),
    confirm,
  };
}
