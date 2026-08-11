import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";

export interface ModelsAllowlistEditorCopy {
  question: string;
  policyHelper: string;
  anyLabel: string;
  anyDesc: string;
  pickedLabel: string;
  pickedDesc: string;
  allowedHeading: string;
  addHeading: string;
  allowedEmpty: string;
  allowedEmptyLab: string;
  searchModels: string;
  clearSearch: string;
  noModels: string;
  allowModel: (name: string) => string;
  readOnlyNote?: string;
}

export interface ModelsAllowlistEditorProps {
  models: CatalogModel[];
  allowedModels: string[] | null;
  saving: boolean;
  readOnly?: boolean;
  onSave: (next: string[] | null) => void;
  copy: ModelsAllowlistEditorCopy;
  /** Visible heading id supplied by a mounting page hero. */
  labelledBy?: string;
  /** Keep false when the mounting page hero carries the question and helper. */
  showIntro?: boolean;
}
