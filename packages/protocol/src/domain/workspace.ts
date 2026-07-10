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

/** A user-created, collapsible sidebar section that agents are dragged into. */
export interface SidebarGroup {
  /** Stable client-minted id (never an agent id). */
  id: string;
  name: string;
  collapsed: boolean;
  /** Member agent ids, in drag order. */
  agentIds: string[];
  /** Shared context injected into every member agent's system prompt (a
   *  group-scoped `WORKSPACE.md`), mirrored to each member's `GROUP.md`.
   *  Absent/empty = no group context. */
  context?: string;
}

/**
 * Per-workspace sidebar arrangement: the user's named groups plus the manual
 * (drag) order of everything. Ordering is ALWAYS manual — there is no sort
 * mode. Agents not referenced by any group render in the default section in
 * `ungroupedOrder`; a brand-new agent (in neither) is appended. Persisted as
 * the `sidebar_layout` workspace preference (JSON). Absent/corrupt reads as
 * `{ groups: [], ungroupedOrder: [] }`.
 */
export interface SidebarLayout {
  /** Named groups, in display order. */
  groups: SidebarGroup[];
  /** Drag order of agents not in any group. */
  ungroupedOrder: string[];
}
