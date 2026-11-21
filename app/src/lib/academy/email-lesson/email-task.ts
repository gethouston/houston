import type { SliceCoverage } from "../../all-conversations-coverage.ts";
import type { RawConversation } from "../../conversations-facade.ts";

export interface EmailAsk {
  agentPath: string;
  knownTaskIds: ReadonlySet<string>;
}

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
