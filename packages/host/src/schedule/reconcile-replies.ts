import {
  type ChatMessage,
  isCompactionSummary,
  type RoutineRun,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import { conversationKey, type WorkspacePaths } from "../paths";
import type { Vfs } from "../vfs";

interface StoredConversation {
  messages: ChatMessage[];
}

export interface ReplyReader {
  replyAfter(
    conversationId: string,
    sinceMs: number,
  ): Promise<ChatMessage | null | undefined>;
}

function replyAfter(
  conversation: StoredConversation | null,
  startedAtMs: number,
): ChatMessage | null {
  if (!conversation) return null;
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const m = conversation.messages[i];
    if (!m) continue;
    if (
      m.role === "assistant" &&
      m.ts >= startedAtMs &&
      !isCompactionSummary(m, conversation.messages[i + 1])
    )
      return m;
  }
  return null;
}

function turnReply(
  conversation: StoredConversation | null,
  run: RoutineRun,
): ChatMessage | null {
  const messages = conversation?.messages ?? [];
  const own = messages.findLast(
    (m, i) =>
      m.role === "assistant" &&
      m.turnId === run.id &&
      !isCompactionSummary(m, messages[i + 1]),
  );
  return own ?? replyAfter(conversation, Date.parse(run.started_at));
}

export function loadRunReplies(
  deps: { vfs: Vfs; paths: WorkspacePaths; replyReader?: ReplyReader },
  ws: Workspace,
  agent: Agent,
  runs: readonly RoutineRun[],
  abandoned?: ReadonlySet<string>,
): Promise<(ChatMessage | null)[]> {
  const read = async (cid: string) => {
    const raw = await deps.vfs.readText(
      conversationKey(deps.paths, ws, agent, cid),
    );
    return raw ? (JSON.parse(raw) as StoredConversation) : null;
  };
  return Promise.all(
    runs.map(async (run) => {
      if (abandoned?.has(run.id))
        return turnReply(await read(run.session_key), run);
      const startedAtMs = Date.parse(run.started_at);
      let remoteReply: ChatMessage | null | undefined;
      try {
        remoteReply = await deps.replyReader?.replyAfter(
          run.session_key,
          startedAtMs,
        );
      } catch (error) {
        console.debug(
          `[transcript-shadow] reply-after failed for ${run.session_key}; using file`,
          error,
        );
      }
      if (
        remoteReply &&
        (remoteReply.turnId === undefined || remoteReply.turnId === run.id)
      )
        return remoteReply;
      const fromFile = turnReply(await read(run.session_key), run);
      return remoteReply && fromFile?.turnId !== run.id
        ? remoteReply
        : fromFile;
    }),
  );
}
