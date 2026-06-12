// Workspaces + agents — the tenancy-index resources the host owns.
// Field shapes match v1 exactly where the family survives, so the
// engine-client rewrite is transport-only and the UI does not churn.

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  /** Per-workspace UI-locale override (BCP-47 base tag); absent/null inherits the global preference. */
  locale?: string | null;
  provider?: string;
  model?: string;
}

export interface CreateWorkspace {
  name: string;
  provider?: string;
  model?: string;
}

export interface RenameWorkspace {
  newName: string;
}

export interface UpdateProvider {
  provider: string;
  model?: string;
}

export interface Agent {
  id: string;
  name: string;
  /**
   * The agent's opaque key, used by the UI to scope feeds/queries and by
   * HoustonEvent.agentPath. Local profile: the real on-disk folder path.
   * Cloud profile: a stable synthetic key. Treat as opaque everywhere.
   */
  folderPath: string;
  configId: string;
  color?: string;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  /** mtime in epoch ms; omitted when the backing store has none. */
  date_modified?: number;
}
