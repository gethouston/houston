import { streamGlobalEvents } from "@houston/runtime-client";
import { refreshLiveToken } from "../session-refresh";
import { type ControlPlaneConfig, liveToken } from "./fetch";

const streamedGateways = new Set<string>();

export function subscribeEvents(
  cfg: ControlPlaneConfig,
  onEvent: (event: unknown) => void,
): () => void {
  const ac = new AbortController();
  void streamGlobalEvents({
    url: () => {
      const org = cfg.activeOrgSlug;
      const orgParam = org ? `&org=${encodeURIComponent(org)}` : "";
      return `${cfg.baseUrl}/v1/events?token=${encodeURIComponent(
        liveToken(cfg.token),
      )}${orgParam}`;
    },
    fetch: (input, init) => fetch(input, init),
    signal: ac.signal,
    onUnauthorized: () => {
      void refreshLiveToken().catch(() => {});
    },
    onConnect: () => {
      if (streamedGateways.has(cfg.baseUrl)) {
        onEvent({ type: "EventStreamReconnected" });
        return;
      }
      streamedGateways.add(cfg.baseUrl);
    },
    wake: subscribeWakeSignals,
    onError: (err) => console.warn("[events] global stream error:", err),
    onEvent: (data) =>
      onEvent(
        toInvalidationEvent(
          data as { type: string; agentPath?: string; workspaceId?: string },
        ),
      ),
  });
  return () => ac.abort();
}

function subscribeWakeSignals(retryNow: () => void): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const onVisible = () => {
    if (document.visibilityState === "visible") retryNow();
  };
  window.addEventListener("online", retryNow);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("online", retryNow);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

export function toInvalidationEvent(frame: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}): { type: string; data: { agent_path?: string; workspace_id?: string } } {
  return {
    type: frame.type,
    data: { agent_path: frame.agentPath, workspace_id: frame.workspaceId },
  };
}
