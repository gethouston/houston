/**
 * Imports as an OUTBOX: each is written down before it is sent and crossed
 * off once the runtime answers, so one that fails (an engine that is waking,
 * a device gone offline, a turn holding the chat) is sent again on the next
 * load instead of being lost. Sending one twice is safe by construction: the
 * runtime writes an `importId` once.
 */

import {
  type ConversationImportRequest,
  parseConversationImportRequest,
} from "@houston/protocol";
import { EngineError } from "@houston/runtime-client";
import { isConversationEditRefusalCode } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { refusalCode } from "../refusal-code";

/** One import this device owes a conversation, and the chat it goes into. */
export interface PendingConversationImport {
  agentId: string;
  conversationId: string;
  request: ConversationImportRequest;
}

/** The storage key the owed imports live under, in the SDK's own store. */
export const PENDING_IMPORTS_KEY = "turns.pendingImports";

/**
 * A refusal no retry can turn around: the body is not an import (400), or the
 * agent is not this person's to write to (403) or does not exist (404). Kept,
 * it would be sent again on every load, forever.
 */
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
  // Every read-modify-write of the owed list runs in turn, so two imports
  // finishing together never drop each other's entry.
  let chain: Promise<void> = Promise.resolve();
  const edit = (
    change: (owed: PendingConversationImport[]) => PendingConversationImport[],
  ): Promise<void> => {
    const run = chain.then(async () => {
      const next = change(await owed());
      if (next.length === 0) await storage.delete(PENDING_IMPORTS_KEY);
      else await storage.set(PENDING_IMPORTS_KEY, JSON.stringify(next));
    });
    // The chain only orders the edits; each caller awaits `run` for its own
    // outcome, so a failed edit must not wedge the ones queued behind it.
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  /** Every import this device still owes, oldest first. */
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

  /** Write the import down before it is sent. The same (agent, conversation,
   *  importId) replaces what was owed: a resumed onboarding closing owes a
   *  SHORTER transcript under the id the interrupted one used, and this drops
   *  the fuller record (PRODUCT-2042, a known gap left as it was). */
  const owe = (entry: PendingConversationImport) =>
    edit((list) => [
      ...list.filter((other) => !sameImport(other, entry)),
      entry,
    ]);

  /**
   * Cross the import off once the runtime answered it, or refused it for
   * good. A failure it may still get past leaves it owed.
   */
  const settle = async (
    entry: PendingConversationImport,
    failure?: unknown,
  ): Promise<void> => {
    if (failure !== undefined && !isFinalRefusal(failure)) return;
    await edit((list) => list.filter((other) => !sameImport(other, entry)));
  };

  return { owed, owe, settle };
}
