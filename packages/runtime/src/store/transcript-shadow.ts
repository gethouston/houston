import type { ChatMessage } from "@houston/runtime-client";
import type { StoredConversation } from "./conversation-file";

interface ShadowBase {
  conversationId: string;
}

export type TranscriptShadowOperation =
  | (ShadowBase & {
      kind: "user";
      turnId: string;
      message: ChatMessage;
      expectedCount: number;
      needsSessionReplay: boolean;
      conversation: StoredConversation;
    })
  | (ShadowBase & {
      kind: "assistant";
      turnId: string;
      message: ChatMessage;
      conversation: StoredConversation;
    })
  | (ShadowBase & {
      kind: "truncate";
      turnId: string;
      conversation: StoredConversation;
    })
  | (ShadowBase & {
      kind: "rename";
      conversation: StoredConversation;
    })
  | (ShadowBase & { kind: "delete" })
  | (ShadowBase & {
      kind: "repair";
      conversation: StoredConversation;
    });

export interface TranscriptShadow {
  enqueue(operation: TranscriptShadowOperation): void;
}

export interface TranscriptShadowTransport {
  send(operation: TranscriptShadowOperation): Promise<void>;
}

const MAX_DIRTY_CONVERSATIONS = 256;

/**
 * Detached, per-conversation shadow queue. File callers only enqueue immutable
 * post-write snapshots; transport failures are contained here and repaired from
 * the next snapshot, so this module can never fail or delay the authoritative
 * file mutation.
 */
export class TranscriptShadowQueue implements TranscriptShadow {
  private readonly dirty = new Set<string>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly transport: TranscriptShadowTransport) {}

  enqueue(operation: TranscriptShadowOperation): void {
    const id = operation.conversationId;
    const prior = this.tails.get(id) ?? Promise.resolve();
    const task = prior
      .then(() => this.process(operation))
      .catch((error: unknown) => this.markDirty(id, error))
      .finally(() => {
        if (this.tails.get(id) === task) this.tails.delete(id);
      });
    this.tails.set(id, task);
  }

  isDirty(conversationId: string): boolean {
    return this.dirty.has(conversationId);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }

  private async process(operation: TranscriptShadowOperation): Promise<void> {
    const id = operation.conversationId;
    if (
      this.dirty.has(id) &&
      operation.kind !== "repair" &&
      operation.kind !== "delete"
    ) {
      try {
        await this.transport.send({
          kind: "repair",
          conversationId: id,
          conversation: operation.conversation,
        });
        this.dirty.delete(id);
        // The repair snapshot was taken after this file mutation, so it already
        // contains the operation. Re-sending would be redundant and is invalid
        // for truncation because the repaired snapshot no longer has that turn.
        return;
      } catch (error) {
        this.markDirty(id, error);
      }
    }

    try {
      await this.transport.send(operation);
      if (operation.kind === "repair" || operation.kind === "delete") {
        this.dirty.delete(id);
      }
    } catch (error) {
      this.markDirty(id, error);
    }
  }

  private markDirty(conversationId: string, error: unknown): void {
    if (!this.dirty.has(conversationId)) {
      if (this.dirty.size >= MAX_DIRTY_CONVERSATIONS) {
        const oldest = this.dirty.values().next().value;
        if (oldest) this.dirty.delete(oldest);
      }
      this.dirty.add(conversationId);
    }
    console.debug(
      `[transcript-shadow] ${conversationId} is dirty; repair will retry`,
      error,
    );
  }
}

/** Freeze the mutable parse-cache object at the file/shadow seam. */
export function snapshotConversation(
  conversation: StoredConversation,
): StoredConversation {
  return JSON.parse(JSON.stringify(conversation)) as StoredConversation;
}
