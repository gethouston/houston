/**
 * Shared in-process event bus. The adapter's HoustonClient emits HoustonEvents
 * (FeedItem, SessionStatus, ActivityChanged, …) onto it; the adapter's
 * EngineWebSocket delivers them to subscribers — standing in for the old
 * engine's real WebSocket so app/src renders streaming chat unchanged.
 */
type Handler = (event: unknown) => void;

class EventBus {
  private handlers = new Set<Handler>();

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  emit(event: unknown): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (e) {
        console.error("[engine-adapter] event handler threw", e);
      }
    }
  }
}

export const bus = new EventBus();

/** Emit a HoustonEvent-shaped object. */
export function emitEvent(type: string, data: unknown): void {
  bus.emit({ type, data });
}

/**
 * Write-through invalidation echo — adapter-synthesizer behavior, app-bus
 * specific (NOT SDK core; see knowledge-base/client-architecture.md, procedure
 * a).
 *
 * The hosted UI's TanStack caches (board status, config, routines, skills,
 * learnings, …) invalidate ONLY on events from the host's global `/v1/events`
 * stream. But after the adapter ITSELF performs a domain write it already KNOWS
 * the matching cache is stale — and waiting for the server round trip (which the
 * gateway historically never even forwarded for pod events) leaves e.g. a board
 * card stuck on "running" after the reply already rendered.
 *
 * So we synthesize the SAME invalidation event locally, in the EXACT shape a real
 * server frame takes after `control-plane.toInvalidationEvent` translation
 * (`{ type, data: { agent_path, workspace_id } }`), and push it onto the SAME bus
 * the server stream feeds → the EngineWebSocket shim (`ws.ts`) →
 * `app/src/hooks/use-agent-invalidation.ts`. Idempotent by construction:
 * invalidation is only a refetch trigger, so the real event arriving later (once
 * the gateway forwards pod events) is a harmless no-op.
 *
 * Call ONLY after a successful domain WRITE — never for reads or turn frames
 * (those flow on the turn stream and are folded once by the SDK). SDK-embedding
 * surfaces need no echo: their VM consumers update directly.
 */
export function emitLocalEcho(
  type: string,
  keys: { agentPath?: string; workspaceId?: string },
): void {
  bus.emit({
    type,
    data: { agent_path: keys.agentPath, workspace_id: keys.workspaceId },
  });
}
