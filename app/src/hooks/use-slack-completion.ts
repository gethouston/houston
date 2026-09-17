import { useEffect, useRef, useState } from "react";
import type { SlackCompletion } from "../lib/settings-landing";
import { takeSlackCompletion } from "../lib/slack-completion";
import { useUIStore } from "../stores/ui";

/**
 * Redeem the ticket a public Slack callback landed with, EXACTLY once
 * (`lib/slack-completion.ts` owns the one-shot rule). The queue is SUBSCRIBED
 * to, so a section that mounted before the landing ran still picks the ticket
 * up, and neither a re-render, a refetch nor a second visit to Channels can
 * send it twice — the gateway answers a replay with the same 404 it gives a
 * stranger, which would read to the user as a broken link.
 *
 * Returns what came back from the URL (a ticket being redeemed, or a link that
 * could never be redeemed) for the section to speak to; the request's own
 * outcome belongs to the mutation.
 */
export function useSlackCompletion(
  redeem: (ticket: string) => void,
): SlackCompletion | null {
  const taken = useRef(false);
  const queued = useUIStore((s) => s.pendingSlackCompletion);
  const clear = useUIStore((s) => s.setPendingSlackCompletion);
  const [completion, setCompletion] = useState<SlackCompletion | null>(null);
  useEffect(() => {
    const pending = takeSlackCompletion(
      taken,
      () => queued,
      () => clear(null),
    );
    if (!pending) return;
    setCompletion(pending);
    if (pending.kind === "ticket") redeem(pending.ticket);
  }, [queued, clear, redeem]);
  return completion;
}
