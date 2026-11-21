import { useCallback, useRef, useState } from "react";
import { looksLikeReasoningModel } from "../lib/local-model-reasoning";

export function useReasoningToggle() {
  const [reasoning, setReasoningState] = useState(false);
  const touched = useRef(false);

  const setReasoning = useCallback((value: boolean) => {
    touched.current = true;
    setReasoningState(value);
  }, []);

  const applyModelDefault = useCallback((model: string) => {
    if (!touched.current) setReasoningState(looksLikeReasoningModel(model));
  }, []);

  const reset = useCallback(() => {
    touched.current = false;
    setReasoningState(false);
  }, []);

  return { reasoning, setReasoning, applyModelDefault, reset };
}
