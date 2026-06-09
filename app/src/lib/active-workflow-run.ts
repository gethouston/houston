import { decodeWorkflowRunMessage } from "@houston-ai/chat";
import type { FeedItem } from "@houston-ai/chat";
import { isCancellable } from "@houston-ai/workflows";
import type { WorkflowRun } from "@houston-ai/workflows";

/** Latest workflow-run link marker in a chat feed, if any. */
export function latestWorkflowRunIdFromFeed(feedItems: FeedItem[]): string | null {
  for (let i = feedItems.length - 1; i >= 0; i--) {
    const item = feedItems[i];
    if (item.feed_type !== "system_message") continue;
    const link = decodeWorkflowRunMessage(item.data);
    if (link) return link.runId;
  }
  return null;
}

/**
 * Run id to cancel when the user stops chat while a linked workflow is in flight.
 * Returns null when there is no linked run or it is already terminal.
 */
export function cancellableWorkflowRunId(
  feedItems: FeedItem[],
  runs: WorkflowRun[] | undefined,
): string | null {
  const runId = latestWorkflowRunIdFromFeed(feedItems);
  if (!runId) return null;
  const run = runs?.find((r) => r.id === runId);
  if (!run) return runId;
  return isCancellable(run.status) ? runId : null;
}
