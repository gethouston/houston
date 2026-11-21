export type ConnectionEvidence = "connected" | "disconnected" | "checking";

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
