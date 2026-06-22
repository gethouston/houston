import { useEffect, useState } from "react";

/**
 * Tick every `intervalMs` so any "in 2h 14m" / "just now" labels stay live
 * without each component running its own timer. Default 60 s.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
