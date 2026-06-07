import {
  OpenRouterModelsEditor,
  type OpenRouterModelsEditorActions,
} from "./openrouter-models-editor";

export type { OpenRouterModelsEditorActions };

interface StepProps {
  onDone: () => void;
  onBack: () => void;
  onActionsReady?: (actions: OpenRouterModelsEditorActions | null) => void;
}

/** Connect-flow wrapper: editor only; footer actions live in the dialog shell. */
export function OpenRouterModelsStep({ onDone, onActionsReady }: StepProps) {
  return (
    <OpenRouterModelsEditor
      showHeader={false}
      onSaved={onDone}
      onActionsReady={onActionsReady}
    />
  );
}
