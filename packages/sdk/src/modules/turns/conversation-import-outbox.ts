import {
  type ConversationImportRequest,
  parseConversationImportRequest,
} from "@houston/protocol";
import { EngineError } from "@houston/runtime-client";
import { isConversationEditRefusalCode } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { refusalCode } from "../refusal-code";

export interface PendingConversationImport {
  agentId: string;
  conversationId: string;
  request: ConversationImportRequest;
}

export const PENDING_IMPORTS_KEY = "turns.pendingImports";

function isFinalRefusal(err: unknown): boolean {
  return (
    err instanceof EngineError &&
    (err.status === 400 ||
      err.status === 403 ||
      err.status === 404 ||
      isConversationEditRefusalCode(refusalCode(err)))
  );
}

function asPending(value: unknown): PendingConversationImport | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  const request = parseConversationImportRequest(entry.request);
  if (
    !request ||
    typeof entry.agentId !== "string" ||
    typeof entry.conversationId !== "string" ||
    entry.conversationId === ""
  )
    return null;
  return {
    agentId: entry.agentId,
    conversationId: entry.conversationId,
    request,
  };
}

const sameImport = (
  a: PendingConversationImport,
  b: PendingConversationImport,
): boolean =>
  a.agentId === b.agentId &&
  a.conversationId === b.conversationId &&
  a.request.importId === b.request.importId;

export function createConversationImportOutbox(ctx: ModuleContext) {
  const { storage, logger } = ctx.config.ports;
  let chain: Promise<void> = Promise.resolve();
  const edit = (
    change: (owed: PendingConversationImport[]) => PendingConversationImport[],
  ): Promise<void> => {
    const run = chain.then(async () => {
      const next = change(await owed());
      if (next.length === 0) await storage.delete(PENDING_IMPORTS_KEY);
      else await storage.set(PENDING_IMPORTS_KEY, JSON.stringify(next));
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  async function owed(): Promise<PendingConversationImport[]> {
    const raw = await storage.get(PENDING_IMPORTS_KEY);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      logger.error("owed conversation imports are unreadable", {
        error: String(error),
      });
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const entry = asPending(value);
      return entry ? [entry] : [];
    });
  }

  const owe = (entry: PendingConversationImport) =>
    edit((list) => [
      ...list.filter((other) => !sameImport(other, entry)),
      entry,
    ]);

  const settle = async (
    entry: PendingConversationImport,
    failure?: unknown,
  ): Promise<void> => {
    if (failure !== undefined && !isFinalRefusal(failure)) return;
    await edit((list) => list.filter((other) => !sameImport(other, entry)));
  };

  return { owed, owe, settle };
}
