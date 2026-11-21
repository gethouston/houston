import type { ConversationTurnStatus } from "../../hooks/use-conversation-vm";

export type VmSessionStatus = ConversationTurnStatus | undefined;

export type BoardRows =
  | {
      readonly present: true;
      readonly statusBySession: ReadonlyMap<string, string>;
    }
  | { readonly present: false };

export interface SessionLoadingInput {
  locallySent: Readonly<Record<string, boolean>>;
  rows: BoardRows;
  openSessionKey: string | null;
  vmStatus: (sessionKey: string) => VmSessionStatus;
}

export function rowSessionKey(row: {
  id: string;
  session_key?: string;
}): string {
  return row.session_key ?? `activity-${row.id}`;
}

export function deriveSessionLoading({
  locallySent,
  rows,
  openSessionKey,
  vmStatus,
}: SessionLoadingInput): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, sent] of Object.entries(locallySent)) {
    if (!sent) continue;
    const status = vmStatus(key);
    if (!rows.present) {
      if (status === undefined || status === "running") out[key] = true;
      continue;
    }
    const known = status === "idle" ? undefined : status;
    const rowStatus = rows.statusBySession.get(key);
    if (!known && rowStatus && rowStatus !== "running") continue;
    if (!known || known === "running") out[key] = true;
  }
  if (rows.present) {
    for (const [key, status] of rows.statusBySession) {
      const vm = vmStatus(key);
      if (vm === "wrapping_up") continue;
      if (status === "running" || vm === "running") out[key] = true;
    }
  }
  if (openSessionKey && vmStatus(openSessionKey) === "running") {
    out[openSessionKey] = true;
  }
  return out;
}
