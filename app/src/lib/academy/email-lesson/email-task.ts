import type { SliceCoverage } from "../../all-conversations-coverage.ts";
import type { RawConversation } from "../../tauri.ts";

/**
 * Which task is the one the lesson asked for. Pure, so it unit-tests without
 * React (`app/tests/academy-email-task.test.ts`).
 *
 * The user sends the request from the ordinary New task composer, so the
 * lesson never holds the new task's id. It knows the sender and the tasks the
 * sender already had when the request was put in front of the user: the task
 * is the sender's one that is not among them.
 */

export interface EmailAsk {
  /** The sending AI Employee's folder path. */
  agentPath: string;
  /** Ids of the tasks the sender already had. */
  knownTaskIds: ReadonlySet<string>;
}

/**
 * The sender's tasks as they stand, taken before the request can be sent, or
 * null while the rows cannot say. Only a slice read this session is the whole
 * truth: a sender whose read failed shows what the board last knew, and every
 * old task the next good read fills in would look like the one just sent.
 */
export function emailAsk(
  rows: readonly RawConversation[],
  agentPath: string,
  coverage: Pick<SliceCoverage, "wasRead">,
): EmailAsk | null {
  if (!coverage.wasRead(agentPath)) return null;
  return {
    agentPath,
    knownTaskIds: new Set(
      rows.filter((row) => row.agent_path === agentPath).map((row) => row.id),
    ),
  };
}

/**
 * The task the request started, or null until it shows up. Should the sender
 * gain more than one (a routine fired meanwhile), the most recently updated
 * one is the live conversation.
 */
export function emailTask(
  rows: readonly RawConversation[],
  ask: EmailAsk,
): RawConversation | null {
  let task: RawConversation | null = null;
  for (const row of rows) {
    if (row.agent_path !== ask.agentPath || ask.knownTaskIds.has(row.id))
      continue;
    if (task === null || (row.updated_at ?? "") > (task.updated_at ?? ""))
      task = row;
  }
  return task;
}
