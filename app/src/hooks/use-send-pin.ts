import { useCallback, useEffect, useRef } from "react";
import type { ModelPin } from "../lib/model-selector-lock";
import { createSendPinGate, type SendPinGate } from "../lib/send-pin-gate";

/**
 * The pin a send carries, read at SEND time rather than captured at render:
 * every send path awaits `resolveSendPin()` and gets the composer's latest
 * provider/model/effort once its inputs have settled (PRODUCT-1771). While the
 * composer is still resolving (a space switch, a cold open) the message waits
 * for the real pin instead of shipping a guess; the wait is bounded by the
 * gate's timeout so a read that never answers cannot strand the message.
 *
 * Stable identity: consumers fold it into `useCallback`s and AIBoard props.
 */
export function useSendPin(
  pin: ModelPin,
  settled: boolean,
  onTimeout?: () => void,
): () => Promise<ModelPin> {
  const gate = useRef<SendPinGate<ModelPin> | null>(null);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  if (gate.current === null) {
    gate.current = createSendPinGate<ModelPin>(pin, () =>
      timeoutRef.current?.(),
    );
  }
  useEffect(() => {
    gate.current?.update(pin, settled);
  }, [pin, settled]);
  return useCallback(() => {
    const current = gate.current;
    return current ? current.resolve() : Promise.reject(new Error("unmounted"));
  }, []);
}
