import type { IntegrationToolkit } from "@houston/engine-adapter";

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
}

export interface AllowlistEditorProps {
  universe: IntegrationToolkit[];
  allowedToolkits: string[] | null;
  seedToolkits: string[];
  saving: boolean;
  onSave: (next: string[] | null) => void;
  copy: AllowlistEditorCopy;
  rowMeta?: ReadonlyMap<string, string>;
  labelledBy?: string;
  showIntro?: boolean;
}
