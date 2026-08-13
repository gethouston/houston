// Turning what the user DOES into Academy usage points, live.
//
// The app already announces every meaningful action as an analytics event, so
// this listens to that one stream rather than sprinkling award calls through a
// dozen features. Points are batched: a burst of chat messages is one write to
// the engine preference, not one per keystroke of activity.

import { subscribeAnalytics } from "../analytics";
import { onAppHidden } from "../app-hidden";
import type { AcademyMutation } from "./academy-mutations.ts";
import { academyQueueFor } from "./academy-ports";
import type { AcademyRecord } from "./academy-record.ts";
import { accrueUsage, usagePointsFor } from "./usage-points.ts";

/** Trailing window. Long enough to swallow a burst, short enough that a user
 *  who earns a point and immediately opens the Academy sees it. */
const FLUSH_DELAY_MS = 2000;

/**
 * Starts paying usage points for tracked events. `getUid` is read at the moment
 * of the event (not at start) so points always land on the account that earned
 * them, even if someone signs out mid-burst — each account has its own mutation
 * queue, and the ports behind it refuse to write to an engine that has moved on
 * to somebody else.
 *
 * `onAccrued` fires once per account per flush, AFTER that flush's write has
 * settled, and is how the screens reading the record hear about it: the Academy
 * is a kept-alive screen whose header never remounts once visited, so without
 * it a user who just earned a point would be shown yesterday's total until the
 * window next regained focus.
 *
 * Points are also flushed SYNCHRONOUSLY whenever the window goes away
 * (`onAppHidden` — a quit, a cmd-tab away, a minimize). That, not the
 * unsubscribe, is what actually saves them on the desktop: this runs at a root
 * that never unmounts, and React runs no cleanup when a window closes, so
 * points already earned would otherwise die behind the engine read a normal
 * flush waits on. Every goodbye flushes; the flush is idempotent (an empty
 * buffer writes nothing, and the queue's sync commit is a no-op for an award
 * already applied), so hearing one twice costs nothing and pays nothing twice.
 *
 * Returns the unsubscribe, which stops listening and flushes once more.
 */
export function startUsageAccrual(
  getUid: () => string | null,
  onAccrued?: (uid: string | null) => void,
): () => void {
  const pending = new Map<string | null, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (teardown: boolean) => {
    timer = null;
    if (pending.size === 0) return;
    const now = new Date();
    for (const [uid, points] of pending) {
      const queue = academyQueueFor(uid);
      const pay: AcademyMutation<AcademyRecord | null> = (record, deviceId) =>
        accrueUsage(record, points, now, deviceId);
      if (teardown) {
        queue.commitSync(pay);
        onAccrued?.(uid);
        continue;
      }
      void queue.run(pay).then(
        () => onAccrued?.(uid),
        (e) => {
          console.error("[academy] usage accrual failed", e);
        },
      );
    }
    pending.clear();
  };

  const unsubscribe = subscribeAnalytics((name) => {
    // The Academy never pays for itself — opening it or clearing a lesson is
    // learning, and learning is already worth experience.
    if (name.startsWith("academy_")) return;
    const points = usagePointsFor(name);
    if (points <= 0) return;
    const uid = getUid();
    pending.set(uid, (pending.get(uid) ?? 0) + points);
    if (timer === null) timer = setTimeout(() => flush(false), FLUSH_DELAY_MS);
  });

  // The real shutdown hook. A pending flush left on its timer is dropped by
  // the same act, because `flush` clears the buffer it just paid out.
  const stopWatchingForGoodbye = onAppHidden(() => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    flush(true);
  });

  return () => {
    unsubscribe();
    stopWatchingForGoodbye();
    if (timer !== null) clearTimeout(timer);
    flush(true);
  };
}
