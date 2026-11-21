import type {
  QueuedShadowOperation,
  TranscriptShadow,
  TranscriptShadowOperation,
  TranscriptShadowSend,
  TranscriptShadowTransport,
} from "./transcript-shadow";
import {
  type ConversationSnapshotSource,
  resolveRepairSend,
} from "./transcript-shadow-repair";

const MAX_DIRTY_CONVERSATIONS = 256;
export const MAX_PENDING_OPERATIONS = 32;

interface Lane {
  pending: QueuedShadowOperation[];
  repairPending: boolean;
  draining: boolean;
}

export class TranscriptShadowQueue implements TranscriptShadow {
  private readonly lanes = new Map<string, Lane>();
  private readonly drains = new Map<string, Promise<void>>();
  private readonly dirty = new Set<string>();

  constructor(
    private readonly transport: TranscriptShadowTransport,
    private readonly loadSnapshot: ConversationSnapshotSource,
  ) {}

  enqueue(operation: TranscriptShadowOperation): void {
    const id = operation.conversationId;
    const lane = this.lane(id);
    if (operation.kind === "delete") {
      if (lane.pending.length > 0 || lane.repairPending) {
        console.debug(
          `[transcript-shadow] ${id} delete supersedes ${lane.pending.length} queued op(s)`,
        );
      }
      lane.pending = [operation];
      lane.repairPending = false;
    } else if (lane.repairPending) {
      console.debug(
        `[transcript-shadow] ${id} ${operation.kind} coalesced into the pending repair`,
      );
    } else if (operation.kind === "repair" || this.dirty.has(id)) {
      this.collapse(id, lane, operation.kind === "repair" ? "repair" : "dirty");
    } else if (lane.pending.length >= MAX_PENDING_OPERATIONS) {
      this.collapse(id, lane, `backpressure at ${lane.pending.length} queued`);
    } else {
      lane.pending.push(operation);
    }
    this.drain(id, lane);
  }

  isDirty(conversationId: string): boolean {
    return this.dirty.has(conversationId);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.drains.values()]);
  }

  async drainForShutdown(timeoutMs: number): Promise<void> {
    for (const id of [...this.dirty]) {
      const lane = this.lane(id);
      if (lane.pending.length === 0 && !lane.repairPending && !lane.draining) {
        lane.repairPending = true;
        this.drain(id, lane);
      }
    }
    const deadline = Date.now() + timeoutMs;
    while (this.drains.size > 0) {
      const left = deadline - Date.now();
      if (left <= 0) {
        console.debug(
          `[transcript-shadow] shutdown drain hit the ${timeoutMs}ms cap with ${this.drains.size} conversation(s) still pending`,
        );
        return;
      }
      await Promise.race([Promise.all([...this.drains.values()]), sleep(left)]);
    }
  }

  private lane(id: string): Lane {
    let lane = this.lanes.get(id);
    if (!lane) {
      lane = { pending: [], repairPending: false, draining: false };
      this.lanes.set(id, lane);
    }
    return lane;
  }

  private collapse(id: string, lane: Lane, reason: string): void {
    if (lane.pending.length > 0) {
      console.debug(
        `[transcript-shadow] ${id} collapsing ${lane.pending.length} queued op(s) into one repair (${reason})`,
      );
    }
    lane.pending = [];
    lane.repairPending = true;
  }

  private drain(id: string, lane: Lane): void {
    if (lane.draining) return;
    lane.draining = true;
    const run = this.run(id, lane).finally(() => {
      lane.draining = false;
      if (this.drains.get(id) === run) this.drains.delete(id);
      if (lane.pending.length > 0 || lane.repairPending) {
        this.drain(id, lane);
      } else {
        this.lanes.delete(id);
      }
    });
    this.drains.set(id, run);
  }

  private async run(id: string, lane: Lane): Promise<void> {
    while (lane.repairPending || lane.pending.length > 0) {
      if (
        this.dirty.has(id) &&
        !lane.repairPending &&
        lane.pending[0]?.kind !== "delete"
      ) {
        this.collapse(id, lane, "dirty");
      }
      try {
        const send = lane.repairPending
          ? this.takeRepair(id, lane)
          : lane.pending.shift();
        if (!send) break;
        await this.transport.send(send);
        if (send.kind === "repair" || send.kind === "delete") {
          this.dirty.delete(id);
        }
      } catch (error) {
        this.markDirty(id, error);
      }
    }
  }

  private takeRepair(id: string, lane: Lane): TranscriptShadowSend {
    lane.repairPending = false;
    return resolveRepairSend(id, this.loadSnapshot);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}
