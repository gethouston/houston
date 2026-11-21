import { createHash } from "node:crypto";
import { APPROVAL_TTL_MS } from "./approval-record";

interface GuardEntry {
  agentId: string;
  conversationId: string;
  fingerprint: string;
  expiresAt: number;
}

export interface GuardReservation {
  nonce: string;
  fingerprint: string;
  expiresAt: number;
}

export type MessageGuardResult =
  | { kind: "new"; release: () => void }
  | { kind: "duplicate" | "conflict" | "full" };

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

  reservationsFor(agentId: string, conversationId: string): GuardReservation[] {
    const now = this.now();
    return [...this.entries]
      .filter(
        ([, entry]) =>
          entry.agentId === agentId &&
          entry.conversationId === conversationId &&
          entry.expiresAt > now,
      )
      .map(([key, entry]) => ({
        nonce: (JSON.parse(key) as [string, string, string])[2],
        fingerprint: entry.fingerprint,
        expiresAt: entry.expiresAt,
      }));
  }

  adopt(agentId: string, conversationId: string, held: GuardReservation): void {
    if (held.expiresAt <= this.now() || this.entries.size >= this.capacity)
      return;
    this.entries.set(JSON.stringify([agentId, conversationId, held.nonce]), {
      agentId,
      conversationId,
      fingerprint: held.fingerprint,
      expiresAt: held.expiresAt,
    });
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
