import { randomBytes } from "node:crypto";
import type { GrantableOperation } from "@houston/protocol";

export const GRANT_TTL_MS = 10 * 60_000;

export interface Grant {
  id: string;
  agentId: string;
  conversationId: string;
  operation: GrantableOperation;
  actor: string;
  requiresActor: boolean;
  expiresAt: number;
}

export class GrantStore {
  private readonly byId = new Map<string, Grant>();
  private readonly heldByRequest = new Map<string, Grant>();

  constructor(private readonly now: () => number = Date.now) {}

  issue(input: Omit<Grant, "id" | "expiresAt">): string {
    this.prune();
    const id = randomBytes(16).toString("hex");
    this.byId.set(id, { ...input, id, expiresAt: this.now() + GRANT_TTL_MS });
    return id;
  }

  revoke(id: string): void {
    this.byId.delete(id);
  }

  spend(input: {
    agentId: string;
    conversationId: string;
    operation: GrantableOperation;
    actor?: string;
  }): Grant | undefined {
    this.prune();
    for (const [id, grant] of this.byId) {
      if (
        grant.agentId === input.agentId &&
        grant.conversationId === input.conversationId &&
        grant.operation === input.operation &&
        (!grant.requiresActor || grant.actor === input.actor)
      ) {
        this.byId.delete(id);
        return grant;
      }
    }
    return undefined;
  }

  held(requestId: string): Grant | undefined {
    return this.heldByRequest.get(requestId);
  }

  hold(requestId: string, grant: Grant): void {
    this.heldByRequest.set(requestId, grant);
  }

  settle(requestId: string, operation: string, refused: boolean): void {
    const grant = this.heldByRequest.get(requestId);
    if (!grant || grant.operation !== operation) return;
    this.heldByRequest.delete(requestId);
    if (refused && grant.expiresAt > this.now()) this.byId.set(grant.id, grant);
  }

  clear(agentId?: string, conversationId?: string): void {
    for (const grants of [this.byId, this.heldByRequest])
      for (const [key, grant] of grants)
        if (
          agentId === undefined ||
          (grant.agentId === agentId &&
            (conversationId === undefined ||
              grant.conversationId === conversationId))
        )
          grants.delete(key);
  }

  private prune(): void {
    const now = this.now();
    for (const grants of [this.byId, this.heldByRequest])
      for (const [key, grant] of grants)
        if (grant.expiresAt <= now) grants.delete(key);
  }
}
