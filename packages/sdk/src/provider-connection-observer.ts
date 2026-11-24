/** Fresh connection evidence only: callers must probe the host, never a cache. */
export type ConnectionEvidence = "connected" | "disconnected" | "checking";

/**
 * Observe one requested connection. A settled success advances once; cancellation
 * invalidates even an in-flight probe so a dismissed chat cannot resume later.
 * Surfaces supply transport and rendering; this owns retry and completion.
 */
export function observeProviderConnection(options: {
  probe: () => Promise<ConnectionEvidence>;
  onState: (state: ConnectionEvidence) => void;
  onConnected: () => void;
  onError: (error: unknown) => void;
  autoContinue: boolean;
  intervalMs?: number;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let state: ConnectionEvidence;
    try {
      state = await options.probe();
    } catch (error) {
      if (stopped) return;
      options.onError(error);
      state = "checking";
    }
    if (stopped) return;
    options.onState(state);
    if (state === "connected" && options.autoContinue) {
      stopped = true;
      options.onConnected();
      return;
    }
    timer = setTimeout(() => void tick(), options.intervalMs ?? 2000);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** A user's Cancel invalidates outstanding evidence until an explicit retry. */
export function createProviderConnectionMonitor(
  options: Parameters<typeof observeProviderConnection>[0] & {
    initiallyPaused?: boolean;
  },
): { retry: () => void; cancel: () => void; dispose: () => void } {
  let completed = false;
  let disposed = false;
  let stop: (() => void) | undefined;
  const begin = (autoContinue: boolean) => {
    stop?.();
    if (disposed || completed) return;
    stop = observeProviderConnection({
      ...options,
      autoContinue,
      onConnected: () => {
        if (completed || disposed) return;
        completed = true;
        options.onConnected();
      },
    });
  };
  if (!options.initiallyPaused) begin(options.autoContinue);
  return {
    retry: () => begin(true),
    cancel: () => {
      stop?.();
      options.onState("checking");
    },
    dispose: () => {
      disposed = true;
      stop?.();
    },
  };
}
