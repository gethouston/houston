import type { ProviderError } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { subscribeHoustonEvents } from "../../../lib/events";
import { getProvider } from "../../../lib/providers";
import { tauriProvider } from "../../../lib/tauri";
import { AI_HUB_VIEW_ID } from "../../../lib/top-level-views";
import { useUIStore } from "../../../stores/ui";
import type { LoginPhase } from "./auth-presentation";
import { type ReconnectSurface, reconnectSurface } from "./reconnect-surface";

export interface ProviderLogin {
  phase: LoginPhase;
  launching: boolean;
  failureDetail: string | null;
  retrying: boolean;
  showConnectDialog: boolean;
  surface: ReconnectSurface | null;
  reconnect: () => Promise<void>;
  cancelSignIn: () => Promise<void>;
  closeConnectDialog: () => void;
  openAiHub: () => void;
}

// WHY: launchLogin resolves when sign-in starts; wait for ProviderLoginComplete. ADR-0058
export function useProviderLogin(
  error: Extract<ProviderError, { kind: "unauthenticated" }>,
  onRetry?: () => Promise<void> | void,
): ProviderLogin {
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [launching, setLaunching] = useState(false);
  const [failureDetail, setFailureDetail] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);
  const relaunchingRef = useRef(false);
  const autoResendFiredRef = useRef(false);
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type !== "ProviderLoginComplete") return;
      if (error.provider) {
        if (ev.data.provider !== error.provider) return;
      } else if (!ev.data.success) {
        return;
      }
      if (ev.data.success) {
        setPhase("done");
        setFailureDetail(null);
        if (useUIStore.getState().authRequired === ev.data.provider) {
          setAuthRequired(null);
        }
        if (onRetryRef.current && !autoResendFiredRef.current) {
          autoResendFiredRef.current = true;
          setRetrying(true);
          void Promise.resolve(onRetryRef.current())
            .catch(() => {})
            .finally(() => setRetrying(false));
        }
      } else if (ev.data.error) {
        setPhase("failed");
        setFailureDetail(ev.data.error);
      } else if (!relaunchingRef.current) {
        setPhase("idle");
      }
    });
  }, [error.provider, setAuthRequired]);

  const surface = error.provider
    ? reconnectSurface(error.provider, getProvider(error.provider)?.auth)
    : null;

  const reconnect = async () => {
    if (launching) return;
    if (!surface) {
      setViewMode(AI_HUB_VIEW_ID);
      return;
    }
    if (surface !== "oauth_login") {
      setFailureDetail(null);
      setShowConnectDialog(true);
      setPhase("waiting");
      return;
    }
    setLaunching(true);
    relaunchingRef.current = true;
    setFailureDetail(null);
    try {
      await tauriProvider.cancelLogin(error.provider);
      await tauriProvider.launchLogin(error.provider);
      setPhase("waiting");
    } catch {
      setPhase("failed");
    } finally {
      relaunchingRef.current = false;
      setLaunching(false);
    }
  };

  const cancelSignIn = async () => {
    if (surface !== "oauth_login") {
      setShowConnectDialog(false);
      setPhase("idle");
      return;
    }
    try {
      await tauriProvider.cancelLogin(error.provider);
    } finally {
      setPhase("idle");
    }
  };

  const closeConnectDialog = () => {
    setShowConnectDialog(false);
    setPhase((p) => (p === "waiting" ? "idle" : p));
  };

  return {
    phase,
    launching,
    failureDetail,
    retrying,
    showConnectDialog,
    surface,
    reconnect,
    cancelSignIn,
    closeConnectDialog,
    openAiHub: () => setViewMode(AI_HUB_VIEW_ID),
  };
}
