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
        const stack = e instanceof Error ? (e.stack ?? "") : "";
        const kind =
          typeof event === "object" && event !== null
            ? String((event as { type?: unknown }).type ?? "")
            : "";
        console.error(
          `[engine-adapter] event handler threw on '${kind}': ${String(e)}\n${stack}`,
        );
      }
    }
  }
}

export const bus = new EventBus();

export function emitEvent(type: string, data: unknown): void {
  bus.emit({ type, data });
}

export function emitLocalEcho(
  type: string,
  keys: { agentPath?: string; workspaceId?: string },
): void {
  bus.emit({
    type,
    data: { agent_path: keys.agentPath, workspace_id: keys.workspaceId },
  });
}
