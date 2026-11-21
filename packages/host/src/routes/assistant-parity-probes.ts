export const PROBE_AGENT = "Work/Sales";
export const PROBE_WORKSPACE = "Work";

export const PROBE_FOLDER = "parity probe";
export const PROBE_FOLDER_RENAMED = "parity probe renamed";

export interface Probe {
  operation: string;
  params: Record<string, unknown>;
  serviceState?: { status: number; reason: string };
  runtimeProxied?: { reason: string };
}

export interface CloudOnlyProbe extends Probe {
  reason: string;
}

export const probe = (
  operation: string,
  params: Record<string, unknown> = {},
  serviceState?: Probe["serviceState"],
): Probe => ({ operation, params, ...(serviceState ? { serviceState } : {}) });

export const proxied = (
  operation: string,
  params: Record<string, unknown>,
  reason: string,
): Probe => ({ operation, params, runtimeProxied: { reason } });

export const cloudOnly = (
  operation: string,
  reason: string,
  params: Record<string, unknown> = {},
): CloudOnlyProbe => ({ operation, params, reason });

export const WRITE_DRIVEN_OPERATIONS: readonly string[] = [
  "preferences.getNextStepSuggestions",
  "preferences.setNextStepSuggestions",
  "createActivity",
  "deleteActivity",
  "createAgent",
  "renameAgent",
  "deleteAgent",
];
