import { bootstrapLocalModelBridge } from "@houston/sdk";
import { useEffect, useState } from "react";
import { listenOsEvent } from "../lib/events";
import { subscribeSession } from "../lib/identity/session-store";
import {
  invalidateLocalBridgeBinding,
  localBridgeController,
  wakeLocalBridge,
} from "../lib/local-bridge-binding";
import { reportLocalBridgeError } from "../lib/local-bridge-ports";
import { osIsTauri } from "../lib/os-bridge";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";

/** Bind native connection lifetime to the application's selected identity. */
export function useLocalBridgeAutoReconnect(userId: string | null): void {
  const [environment, setEnvironment] = useState(
    () => window.__HOUSTON_ENGINE__?.baseUrl,
  );
  const agentId = useAgentStore((state) => state.current?.id);
  const agentsLoaded = useAgentStore((state) => state.loaded && !state.loading);
  const workspaceId = useWorkspaceStore((state) => state.current?.id);

  useEffect(() => {
    if (!osIsTauri()) return;
    const offSession = subscribeSession((session) => {
      if (session?.uid !== userId) invalidateLocalBridgeBinding();
    });
    const offWorkspace = useWorkspaceStore.subscribe((state, previous) => {
      if (state.current?.id !== previous.current?.id)
        invalidateLocalBridgeBinding();
    });
    const offAgent = useAgentStore.subscribe((state, previous) => {
      if (state.current?.id !== previous.current?.id)
        invalidateLocalBridgeBinding();
    });
    const wake = () => {
      void wakeLocalBridge().catch(reportLocalBridgeError);
    };
    const offActivated = listenOsEvent("app-activated", wake);
    const visible = () => {
      if (document.visibilityState === "visible") wake();
    };
    const environmentChanged = () => {
      invalidateLocalBridgeBinding();
      setEnvironment(window.__HOUSTON_ENGINE__?.baseUrl);
    };
    window.addEventListener("online", wake);
    window.addEventListener(
      "houston-engine-environment-changed",
      environmentChanged,
    );
    document.addEventListener("visibilitychange", visible);
    return () => {
      offSession();
      offWorkspace();
      offAgent();
      offActivated();
      window.removeEventListener("online", wake);
      window.removeEventListener(
        "houston-engine-environment-changed",
        environmentChanged,
      );
      document.removeEventListener("visibilitychange", visible);
      invalidateLocalBridgeBinding();
    };
  }, [userId]);

  useEffect(() => {
    if (environment !== window.__HOUSTON_ENGINE__?.baseUrl) return;
    if (!osIsTauri() || !userId || !agentId || !workspaceId || !agentsLoaded)
      return;
    const abort = new AbortController();
    void bootstrapLocalModelBridge(
      () => localBridgeController(userId),
      abort.signal,
      { report: reportLocalBridgeError },
    )
      .then(async (bridge) => {
        if (!abort.signal.aborted) await bridge?.resume();
      })
      .catch((error: unknown) => {
        if (
          !abort.signal.aborted &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          reportLocalBridgeError(error);
      });
    return () => {
      abort.abort();
    };
  }, [userId, agentId, workspaceId, agentsLoaded, environment]);
}
