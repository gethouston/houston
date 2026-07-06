import { useCallback, useRef, useState } from "react";
import { looksLikeReasoningModel } from "../lib/local-model-reasoning";

/**
 * Owns the "show the model's thinking" toggle for the connect-a-local-model
 * flow. Defaults to the reasoning heuristic for the current model until the user
 * flips it, after which their choice sticks.
 *
 * - `setReasoning` records that the user overrode the default.
 * - `applyModelDefault(model)` re-runs the heuristic when the picked/typed model
 *   changes (a no-op once the user has overridden).
 * - `reset` returns to the untouched default (used when the dialog reopens).
 *
 * Shared by the guided pick step (`useLocalModelConnect`) and the manual form so
 * the default/override behaviour is identical on both paths.
 */
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
