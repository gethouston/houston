import { useCallback, useEffect, useRef } from "react";
import type { ModelPin } from "../lib/model-selector-lock";
import { createSendPinGate, type SendPinGate } from "../lib/send-pin-gate";

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
