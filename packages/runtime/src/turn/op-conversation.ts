import { join, posix } from "node:path";
import { PRIVATE_REFUSED_CODE } from "@houston/host/src/op/dispatch-relay";
import { LazyReadRefusedError } from "@houston/host/src/vfs";
import {
  CONVERSATION_IMPORT_INVALID,
  parseConversationImportRequest,
} from "@houston/protocol";
import {
  appendAssistantMessageAt,
  deleteConversationAt,
  loadConversation,
  renameConversationMutationAt,
  saveConversation,
} from "../store/conversation-file";
import { importConversationMessagesAt } from "../store/conversation-import";
import { truncateConversationMutationAt } from "../store/conversation-truncate";
import {
  notInteractionOwnerBody,
  refusesInteractionAnswer,
} from "../store/interaction-owner";
import type { ConversationOp } from "./op-grammar-conversation";
import type { OpResult } from "./op-result";
import { conversationScope, engineAgentId } from "./op-scope";
import type { TurnFilesystem } from "./turn-filesystem";

export async function applyConversationOp(
  op: ConversationOp,
  fs: TurnFilesystem,
  actingUserId?: string,
): Promise<OpResult> {
  const { conversationId: cid, action } = op;
  const dir = join(fs.dataDir, "conversations");
  const rel = posix.join(fs.dataRel, "conversations");
  const file = posix.join(rel, `${encodeURIComponent(cid)}.json`);
  const scope = conversationScope(fs.dataRel, cid);
  const answer = (
    status: number,
    body: unknown,
    changed = false,
  ): OpResult => ({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
    include: scope,
    events: changed
      ? [{ type: "ConversationsChanged", agentPath: engineAgentId(fs) }]
      : [],
  });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(op.body || "{}");
  } catch {}
  const request =
    action === "import" ? parseConversationImportRequest(body) : null;
  if (action === "import" && !request)
    return answer(400, {
      error: "not a conversation import",
      code: CONVERSATION_IMPORT_INVALID,
    });
  if (
    action === "truncate" &&
    (typeof body?.turnId !== "string" || !body.turnId)
  )
    return answer(400, { error: "missing 'turnId'" });

  const exists = (await fs.vfs.list(rel)).includes(file);
  if (action === "delete") {
    if (!exists) return answer(404, { error: "conversation not found" });
    await fs.vfs.deleteKey(file);
    await fs.vfs.deletePrefix(posix.join(fs.dataRel, "sessions", cid));
    await fs.vfs.deletePrefix(
      posix.join(rel, `${encodeURIComponent(cid)}.archive`),
    );
    deleteConversationAt(dir, cid);
    return answer(200, { ok: true }, true);
  }
  try {
    if (exists) await fs.vfs.readBytes(file);
    for (const key of action === "rename" || op.transcript !== undefined
      ? []
      : await fs.vfs.list(
          posix.join(rel, `${encodeURIComponent(cid)}.archive`),
        ))
      await fs.vfs.readBytes(key);
  } catch (error) {
    if (!(error instanceof LazyReadRefusedError)) throw error;
    return {
      ...answer(
        503,
        error.reason === "private"
          ? {
              error: "conversation could not be read asleep",
              code: PRIVATE_REFUSED_CODE,
            }
          : { error: "conversation too large to edit asleep" },
      ),
      decline: true,
    };
  }
  if (
    (action === "dismiss-interaction" ||
      action === "import" ||
      action === "truncate") &&
    refusesInteractionAnswer(
      op.transcript !== undefined
        ? (op.transcript?.messages ?? [])
        : (loadConversation(dir, cid)?.messages ?? []),
      actingUserId,
    )
  )
    return answer(403, notInteractionOwnerBody);
  if (op.transcript !== undefined) {
    const existing = loadConversation(dir, cid);
    await fs.vfs.deletePrefix(
      posix.join(rel, `${encodeURIComponent(cid)}.archive`),
    );
    if (op.transcript === null) {
      await fs.vfs.deleteKey(file);
      deleteConversationAt(dir, cid);
    } else {
      const next = { ...existing, ...op.transcript };
      delete next.archived;
      delete next.needsSessionReplay;
      if (op.transcript.needsSessionReplay) next.needsSessionReplay = true;
      saveConversation(dir, next);
    }
  }
  if (action === "rename") {
    return renameConversationMutationAt(dir, cid, op.title ?? "")
      ? answer(200, { ok: true }, true)
      : answer(404, { error: "conversation not found" });
  }
  let changed = false;
  let response: unknown;
  if (action === "truncate") {
    const cut = truncateConversationMutationAt(dir, cid, body.turnId as string);
    if (!cut) return answer(404, { error: "turn not found" });
    changed = true;
    response = { ok: true, removed: cut.removed };
  } else if (action === "import" && request) {
    const imported = importConversationMessagesAt(dir, cid, request);
    changed = imported > 0;
    response = { ok: true, imported };
  } else {
    changed =
      appendAssistantMessageAt(dir, cid, "", { stopped: true }) !== undefined;
    response = { ok: true };
  }
  if (changed && action !== "dismiss-interaction")
    await fs.vfs.deletePrefix(posix.join(fs.dataRel, "sessions", cid));
  return answer(200, response, changed);
}
