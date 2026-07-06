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

export type LocalModelMode =
  | "detecting"
  | "empty"
  | "pick"
  | "connecting"
  | "error"
  | "manual";

/** Detection is a quick localhost scan; the connect mints a tunnel + starts frpc
 *  and can legitimately take longer. Both fall back to the calm error state (with
 *  retry) if they hang, so the dialog can never spin forever. */
const DETECT_TIMEOUT_MS = 20_000;
const CONNECT_TIMEOUT_MS = 90_000;

/** Race `work` against a timeout; aborting the controller stops the timer and
 *  (via the signal) rolls back any half-open bridge. */
function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  controller: AbortController,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      controller.abort();
      reject(new Error("local-model timeout"));
    }, ms);
    controller.signal.addEventListener("abort", () => clearTimeout(id));
  });
  return Promise.race([work(controller.signal), timeout]);
}

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
  onConnected?: (model: string) => void;
  onClose: () => void;
}) {
  const { active, desktop, onConnected, onClose } = opts;
  const [mode, setMode] = useState<LocalModelMode>("detecting");
  const [servers, setServers] = useState<DetectedServer[]>([]);
  const [selected, setSelected] = useState(0);
  const [model, setModel] = useState("");

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
        await withTimeout(
          () => detectLocalModels(),
          DETECT_TIMEOUT_MS,
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
      setModel(defaultModelFor(found[0]));
      setMode("pick");
    } catch {
      // detectLocalModels already toasted the real reason (Report-bug); an abort
      // is a silent cancel. Either way, land on the calm error state if visible.
      if (!controller.signal.aborted && mounted.current) setMode("error");
    }
  }, []);

  // Fresh start on every open: guided detection on desktop, manual in a browser.
  useEffect(() => {
    if (!active) return;
    setServers([]);
    setSelected(0);
    setModel("");
    if (desktop) void runDetect();
    else setMode("manual");
  }, [active, desktop, runDetect]);

  const selectServer = useCallback(
    (index: number) => {
      setSelected(index);
      setModel(defaultModelFor(servers[index]));
    },
    [servers],
  );

  const connect = useCallback(async () => {
    const server = servers[selected];
    if (!server || !model) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMode("connecting");
    try {
      await withTimeout(
        (signal) =>
          connectDetectedModel({
            server,
            model,
            name: defaultEndpointName(server.kind, model),
            appName: appDisplayName(server.kind),
            signal,
          }),
        CONNECT_TIMEOUT_MS,
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
  }, [servers, selected, model, onConnected, onClose]);

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
    setModel,
    selectServer,
    runDetect,
    connect,
    cancel,
    goManual,
  };
}
