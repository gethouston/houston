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
  connectFailureMode,
  LOCAL_MODEL_CONNECT_TIMEOUT_MS,
  LOCAL_MODEL_DETECT_TIMEOUT_MS,
  type LocalModelMode,
} from "../lib/local-model-connect-state";
import { withLocalModelTimeout } from "../lib/local-model-timeout";
import { useLocalModelShare } from "./use-local-model-share";
import { useReasoningToggle } from "./use-reasoning-toggle";

export type { LocalModelMode } from "../lib/local-model-connect-state";

export function useLocalModelConnect(opts: {
  active: boolean;
  desktop: boolean;
  teamWorkspace: boolean;
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
  const {
    reasoning,
    setReasoning,
    applyModelDefault,
    reset: resetReasoning,
  } = useReasoningToggle();

  const chooseModel = useCallback(
    (next: string) => {
      setModelState(next);
      applyModelDefault(next);
    },
    [applyModelDefault],
  );

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
      if (!controller.signal.aborted && mounted.current) setMode("error");
    }
  }, [chooseModel]);

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
    } catch (error) {
      if (!controller.signal.aborted && mounted.current)
        setMode(connectFailureMode(error));
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
