import { useEffect, useState } from "react";
import type { SlackCompletion } from "../lib/settings-landing";
import { takeSlackCompletion } from "../lib/slack-completion";
import { useUIStore } from "../stores/ui";

export function useSlackCompletion(
  redeem: (ticket: string) => void,
): SlackCompletion | null {
  const queued = useUIStore((s) => s.pendingSlackCompletion);
  const clear = useUIStore((s) => s.setPendingSlackCompletion);
  const [completion, setCompletion] = useState<SlackCompletion | null>(null);
  useEffect(() => {
    if (!queued) return;
    const pending = takeSlackCompletion(
      () => useUIStore.getState().pendingSlackCompletion,
      () => clear(null),
    );
    if (!pending) return;
    setCompletion(pending);
    if (pending.kind === "ticket") redeem(pending.ticket);
  }, [queued, clear, redeem]);
  return completion;
}
