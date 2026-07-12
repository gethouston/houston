import { useCallback, useEffect, useRef, useState } from "react";
import {
  appDisplayName,
  connectableServers,
  type DetectedServer,
  defaultEndpointName,
  defaultModelFor,
} from "../lib/local-model";
import {
  connectDetectedModel,
  detectLocalModels,
} from "../lib/local-model-connect";
import {
  LOCAL_MODEL_CONNECT_TIMEOUT_MS,
  LOCAL_MODEL_DETECT_TIMEOUT_MS,
  type LocalModelMode,
} from "../lib/local-model-connect-state";
import { withLocalModelTimeout } from "../lib/local-model-timeout";
import { useLocalModelShare } from "./use-local-model-share";
import { useReasoningToggle } from "./use-reasoning-toggle";

export type { LocalModelMode } from "../lib/local-model-connect-state";

/**
 * Owns the guided "connect a local model" flow: detection, model pick, and the
 * tunnel connect, with a timeout + Cancel + AbortController on the in-flight
 * steps. Closing the dialog mid-flight aborts the work (no setState after
 * unmount) and rolls back any half-open bridge, so we never strand a zombie
 * tunnel. Keeps the dialog component thin and presentational.
 */
export function useLocalModelConnect(opts: {
  /** The dialog is open (a provider was passed). */
  active: boolean;
  /** Native bridge available (desktop). Web opens straight to the manual form. */
  desktop: boolean;
  /** Whether the active workspace can publish an organization share. */
  teamWorkspace: boolean;
  /** Active workspace identity, used to prevent sharing into a newly switched team. */
  workspaceId: string;
  onConnected?: (model: string) => void;
  onClose: () => void;
}) {
  const { active, desktop, teamWorkspace, workspaceId, onConnected, onClose } =
    opts;
  const [mode, setMode] = useState<LocalModelMode>("detecting");
  const [servers, setServers] = useState<DetectedServer[]>([]);
  const [selected, setSelected] = useState(0);
  const [model, setModelState] = useState("");
  const { shared, setShared } = useLocalModelShare(workspaceId);
  // "Show the model's thinking" toggle (heuristic default, user can override).
  const {
    reasoning,
    setReasoning,
    applyModelDefault,
    reset: resetReasoning,
  } = useReasoningToggle();

  /** Pick a model and re-apply the reasoning default for it. */
  const chooseModel = useCallback(
    (next: string) => {
      setModelState(next);
      applyModelDefault(next);
    },
    [applyModelDefault],
  );

  // The controller for the current in-flight step (detect or connect); Cancel /
  // close abort it. `mounted` guards setState after the dialog unmounts.
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runDetect = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMode("detecting");
    try {
      const found = connectableServers(
        await withLocalModelTimeout(
          () => detectLocalModels(),
          LOCAL_MODEL_DETECT_TIMEOUT_MS,
          controller,
        ),
      );
      if (controller.signal.aborted || !mounted.current) return;
      if (found.length === 0) {
        setMode("empty");
        return;
      }
      setServers(found);
      setSelected(0);
      chooseModel(defaultModelFor(found[0]));
      setMode("pick");
    } catch {
      // detectLocalModels already toasted the real reason (Report-bug); an abort
      // is a silent cancel. Either way, land on the calm error state if visible.
      if (!controller.signal.aborted && mounted.current) setMode("error");
    }
  }, [chooseModel]);

  // Fresh start on every open: guided detection on desktop, manual in a browser.
  useEffect(() => {
    if (!active) return;
    setServers([]);
    setSelected(0);
    setShared(false);
    resetReasoning();
    chooseModel("");
    if (desktop) void runDetect();
    else setMode("manual");
  }, [active, desktop, runDetect, chooseModel, resetReasoning, setShared]);

  const selectServer = useCallback(
    (index: number) => {
      setSelected(index);
      chooseModel(defaultModelFor(servers[index]));
    },
    [servers, chooseModel],
  );

  const connect = useCallback(async () => {
    const server = servers[selected];
    if (!server || !model) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMode("connecting");
    try {
      await withLocalModelTimeout(
        (signal) =>
          connectDetectedModel({
            server,
            model,
            name: defaultEndpointName(server.kind, model),
            appName: appDisplayName(server.kind),
            reasoning,
            shared: teamWorkspace && shared,
            signal,
          }),
        LOCAL_MODEL_CONNECT_TIMEOUT_MS,
        controller,
      );
      if (controller.signal.aborted || !mounted.current) return;
      onConnected?.(model);
      onClose();
    } catch {
      // The failing step already toasted (Report-bug); an abort/timeout rolled
      // the bridge back. Show a calm retry state unless we were cancelled/closed.
      if (!controller.signal.aborted && mounted.current) setMode("error");
    }
  }, [
    servers,
    selected,
    model,
    reasoning,
    shared,
    teamWorkspace,
    onConnected,
    onClose,
  ]);

  /** Cancel the in-flight detect/connect: abort the work (the connect's own
   *  abort path rolls back any half-open bridge) and close the dialog. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    onClose();
  }, [onClose]);

  const goManual = useCallback(() => {
    abortRef.current?.abort();
    setMode("manual");
  }, []);

  return {
    mode,
    servers,
    selected,
    model,
    setModel: chooseModel,
    reasoning,
    setReasoning,
    shared,
    setShared,
    selectServer,
    runDetect,
    connect,
    cancel,
    goManual,
  };
}
