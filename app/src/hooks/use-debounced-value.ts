import { useEffect, useState } from "react";

/**
 * `value`, but only after it has stopped changing for `delayMs`.
 *
 * For work a keystroke should NOT pay for on every character — anything that
 * costs a network round trip. Mission search hangs its transcript scan off
 * this: typing "budget" used to fire a full history load per mission per
 * keystroke (HOU-941), while the instant client-side filter stays on the raw
 * value so the board still narrows as you type.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Already settled (mount, or the timer just landed): no timer, and above
    // all no redundant state write — this sits above a whole board.
    if (Object.is(value, debounced)) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, debounced, delayMs]);

  return debounced;
}
