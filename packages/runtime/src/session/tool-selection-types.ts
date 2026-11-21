export type CodeExecutionMode = "local" | "remote" | "disabled";

export interface ToolSelectionInput {
  codeExecution: CodeExecutionMode;
  integrations: boolean;
  providerConnections?: boolean;
  saveRoutine?: boolean;
  saveLearning?: boolean;
  missions?: boolean;
  assistant?: boolean;
  personalAssistant?: boolean;
}

export interface ToolSelection {
  toolNames: string[];
  includeRunCode: boolean;
}
