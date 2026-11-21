export interface PanelTaskLabels {
  task: (title: string) => string;
  newTask: string;
}

export function panelTaskLabel(
  labels: PanelTaskLabels,
  selectedId: string | null,
  title: string | undefined,
): string {
  if (!selectedId) return labels.newTask;
  return title ? labels.task(title) : "";
}
