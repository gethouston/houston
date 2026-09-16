import { createHash } from "node:crypto";
import { APPROVAL_TTL_MS } from "./approval-record";

interface GuardEntry {
  agentId: string;
  conversationId: string;
  fingerprint: string;
  expiresAt: number;
}

export type MessageGuardResult =
  | { kind: "new"; release: () => void }
  | { kind: "duplicate" | "conflict" | "full" };

/** Protect host-owned approval mutation while its short-lived receipts exist. */
export class ApprovalMessageGuard {
  private readonly entries = new Map<string, GuardEntry>();

  constructor(
    private readonly now: () => number,
    private readonly capacity = 2048,
  ) {}

  reserve(
    agentId: string,
    conversationId: string,
    nonce: string,
    content: string,
  ): MessageGuardResult {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    const key = JSON.stringify([agentId, conversationId, nonce]);
    const fingerprint = createHash("sha256").update(content).digest("hex");
    const previous = this.entries.get(key);
    if (previous)
      return {
        kind: previous.fingerprint === fingerprint ? "duplicate" : "conflict",
      };
    // Never evict a live guard to admit a new one: that would let a retry
    // mutate the receipt it was supposed to leave alone.
    if (this.entries.size >= this.capacity) return { kind: "full" };
    const entry = {
      agentId,
      conversationId,
      fingerprint,
      expiresAt: now + APPROVAL_TTL_MS,
    };
    this.entries.set(key, entry);
    return {
      kind: "new",
      release: () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    };
  }

  clear(agentId?: string, conversationId?: string): void {
    for (const [key, entry] of this.entries) {
      if (agentId !== undefined && entry.agentId !== agentId) continue;
      if (
        conversationId !== undefined &&
        entry.conversationId !== conversationId
      )
        continue;
      this.entries.delete(key);
    }
  }
}
