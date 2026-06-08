/**
 * Workflow-run link message marker.
 *
 * After a chat-triggered workflow starts, the engine persists a system
 * message carrying this marker so the chat renderer can show a live run
 * panel instead of raw comment text.
 *
 * Format:
 *
 *     <!--houston:workflow-run {"runId":"..."}-->
 */

const MARKER_RE = /^<!--houston:workflow-run (\{[\s\S]*?\})-->/;

export interface WorkflowRunLink {
  runId: string;
}

/**
 * Try to extract a workflow-run link from a system-message body.
 * Returns `null` when the body is not a run-link marker.
 */
export function decodeWorkflowRunMessage(body: string): WorkflowRunLink | null {
  const match = body.match(MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Partial<WorkflowRunLink> &
      Record<string, unknown>;
    if (typeof payload?.runId !== "string" || payload.runId.trim() === "") {
      return null;
    }
    return { runId: payload.runId };
  } catch {
    return null;
  }
}
