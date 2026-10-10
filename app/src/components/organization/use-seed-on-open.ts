import { useEffect, useRef, useState } from "react";

/**
 * Editable text seeded from `seed` each time `open` turns on, and left
 * alone while it stays open: an edit survives anything that re-renders the
 * dialog (a reload of the data the seed reads included).
 */
export function useSeedOnOpen(open: boolean, seed: () => string) {
  const [value, setValue] = useState("");
  const wasOpen = useRef(false);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  useEffect(() => {
    if (open && !wasOpen.current) setValue(seedRef.current());
    wasOpen.current = open;
  }, [open]);
  return [value, setValue] as const;
}
