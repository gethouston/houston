import { sep } from "node:path";
import type { Slot } from "./pool-slot";

export async function eachSlotUnder(
  slots: Map<string, Slot>,
  dir: string,
  what: string,
  run: (slot: Slot) => Promise<boolean>,
): Promise<string[]> {
  const prefix = dir.endsWith(sep) ? dir : `${dir}${sep}`;
  const under = [...slots].filter(([, slot]) =>
    slot.statePath.startsWith(prefix),
  );
  const results = await Promise.allSettled(under.map(([, slot]) => run(slot)));
  for (const result of results)
    if (result.status === "rejected")
      console.error(`[browser] ${what} failed`, result.reason);
  return under.map(([key]) => key);
}
