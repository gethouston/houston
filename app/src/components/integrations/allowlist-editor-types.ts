import type { IntegrationToolkit } from "@houston-ai/engine-client";

export interface AllowlistEditorCopy {
  question: string;
  policyHelper: string;
  anyLabel: string;
  anyDesc: string;
  pickedLabel: string;
  pickedDesc: string;
  allowedHeading: string;
  addHeading: string;
  allowedEmpty: string;
  allowedEmptyCategory: string;
  allowApp: (name: string) => string;
  readOnlyNote?: string;
}

export interface AllowlistEditorProps {
  universe: IntegrationToolkit[];
  allowedToolkits: string[] | null;
  seedToolkits: string[];
  saving: boolean;
  readOnly?: boolean;
  onSave: (next: string[] | null) => void;
  copy: AllowlistEditorCopy;
  rowMeta?: ReadonlyMap<string, string>;
  /** Visible heading id supplied by a mounting page hero. */
  labelledBy?: string;
  /** Keep false when the mounting page hero carries the question and helper. */
  showIntro?: boolean;
}
