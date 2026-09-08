import type { LocalModelBridgePorts } from "./types";

// Native stop is identity-scoped and must interrupt an in-flight dial. Sending
// it from the abort callback avoids queuing cancellation behind that same dial.
export async function withNativeCancellation<T>(
  ports: LocalModelBridgePorts,
  signal: AbortSignal,
  operation: () => Promise<T>,
) {
  signal.throwIfAborted();
  let stopping: Promise<void> | undefined;
  const abort = () => {
    stopping = ports.native.stop();
    void stopping.catch(ports.report);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const ready = await operation();
    signal.throwIfAborted();
    return ready;
  } finally {
    signal.removeEventListener("abort", abort);
    if (stopping) await stopping;
  }
}

export function startBridgeNative(
  ports: LocalModelBridgePorts,
  input: Parameters<LocalModelBridgePorts["native"]["start"]>[0],
  signal: AbortSignal,
) {
  return withNativeCancellation(ports, signal, () => ports.native.start(input));
}
