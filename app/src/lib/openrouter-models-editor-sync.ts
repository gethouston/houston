export interface OpenRouterModelsEditorActions {
  canFinish: boolean;
  saving: boolean;
  onFinish: () => void;
}

/** Skip redundant parent setState when footer flags are unchanged. */
export function syncOpenRouterEditorActions(
  prev: OpenRouterModelsEditorActions | null,
  next: OpenRouterModelsEditorActions | null,
): OpenRouterModelsEditorActions | null {
  if (!next) return null;
  if (prev?.canFinish === next.canFinish && prev?.saving === next.saving) return prev;
  return next;
}
