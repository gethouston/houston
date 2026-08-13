// The Academy's usage economy, plugged into the running app.
//
// `startUsageAccrual` is React-free on purpose (`lib/academy/usage-live.ts`);
// this is the one place that gives it a life span and an identity to pay.

import { useEffect } from "react";
import { activeAccountUid } from "../lib/academy/academy-ports";
import { startUsageAccrual } from "../lib/academy/usage-live";
import { queryClient } from "../lib/query-client";
import { academyProgressKey } from "./use-academy-progress";

/**
 * Pays Academy usage points for what the user does, for the whole life of the
 * app, always to whoever is signed in at the moment of the event
 * (`activeAccountUid` — the accrual outlives every sign-in and sign-out, so a
 * uid captured from a render would keep paying the wrong account).
 *
 * Mounted ONCE per surface, ABOVE every gate — the desktop entry's
 * `StartupEffects` (app/src/main.tsx) and the web tree's root
 * (packages/web/src/app-tree.tsx) — never inside `<App/>`, which is keyed by
 * identity and so remounts on every sign-in, and which a first-run user does
 * not reach for minutes. A second live instance would pay every event twice.
 *
 * The subscription is torn down on unmount, which FLUSHES what is still
 * pending: a closing window must not swallow points already earned.
 */
export function useUsageAccrual(): void {
  useEffect(
    () =>
      startUsageAccrual(activeAccountUid, (uid) => {
        // The same refresh a finished lesson performs
        // (`lessons/use-lesson-award.ts`): the Academy is a kept-alive screen,
        // so its header reads this query without ever remounting, and the
        // write is only visible once the query is told to re-read.
        void queryClient.invalidateQueries({
          queryKey: academyProgressKey(uid),
        });
      }),
    [],
  );
}
