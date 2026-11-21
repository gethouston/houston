import { subscribeAnalytics } from "../analytics";
import { onAppHidden } from "../app-hidden";
import type { AcademyMutation } from "./academy-mutations.ts";
import { academyQueueFor } from "./academy-ports";
import type { AcademyRecord } from "./academy-record.ts";
import { accrueUsage, usagePointsFor } from "./usage-points.ts";

const FLUSH_DELAY_MS = 2000;

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
    if (name.startsWith("academy_")) return;
    const points = usagePointsFor(name);
    if (points <= 0) return;
    const uid = getUid();
    pending.set(uid, (pending.get(uid) ?? 0) + points);
    if (timer === null) timer = setTimeout(() => flush(false), FLUSH_DELAY_MS);
  });

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
