/** A workspace (top-level container, formerly "Space") */
export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  /**
   * Optional per-workspace UI-locale override (BCP-47 base tag: `en`/`es`/`pt`).
   * Absent/null means the workspace inherits the global `locale` preference.
   */
  locale?: string | null;
}

/** Agent category for Houston Store filtering */
export type AgentCategory =
  | "productivity"
  | "development"
  | "research"
  | "creative"
  | "business";

/** An agent mode defines a prompt profile (e.g. "execution" or "planning"). */
export interface AgentMode {
  id: string; // e.g. "execution", "planning"
  name: string; // Display name, e.g. "Coder", "Planner"
  promptFile: string; // Mode name → reads .houston/prompts/modes/{promptFile}.md
  createLabel: string; // Button label, e.g. "New Mission"
}

/** The agent config (houston.json schema) */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string; // Lucide icon name (fallback if no image)
  image?: string; // Image URL for store card
  color?: string; // Brand color override
  category?: AgentCategory;
  author?: string; // e.g. "Houston" for official, user name for community
  tags?: string[]; // Searchable tags
  integrations?: string[]; // Legacy toolkit slugs declared by bundled agents (display-only metadata)
  claudeMd?: string; // CLAUDE.md content template
  systemPrompt?: string; // System prompt for the assistant
  agentSeeds?: Record<string, string>; // Files to seed in new agents
  features?: string[]; // Rust feature flags needed
  agents?: AgentMode[]; // Multiple prompt profiles for multi-agent setups
}

/** A resolved agent definition (config + where it came from) */
export interface AgentDefinition {
  config: AgentConfig;
  source: "builtin" | "installed";
  path?: string; // For installed: ~/.houston/agents/{id}/
}

/** An agent instance (formerly "Workspace") */
export interface Agent {
  id: string;
  name: string;
  folderPath: string; // ~/.houston/workspaces/{WorkspaceName}/{AgentName}/
  configId: string; // Points to an AgentConfig
  color?: string; // User-chosen color for avatar
  createdAt: string;
  lastOpenedAt?: string;
  /**
   * Absolute on-disk directory, present only when the engine is co-located
   * with the files (TS host, local profile). What OS reveal/open needs — on
   * the TS engine `folderPath` is a route key, not a path (HOU-677).
   */
  localDir?: string;
  /**
   * Multiplayer only: whether the CURRENT user is assigned this agent (may use
   * it). Absent in single-player mode. Kept in sync (by hand) with the
   * engine-client `Agent` shape.
   */
  assigned?: boolean;
  /**
   * Multiplayer only: the org-member user ids this agent is assigned to. Empty
   * means "everyone in the org". Absent in single-player mode.
   */
  assignedUserIds?: string[];
  /**
   * Teams v2: the CURRENT caller's effective access to this agent (`manager`
   * may reconfigure it, `user` may only use it). Absent in single-player mode.
   * Drives the client-side read-only gating (agent-access `isAgentManager`);
   * the gateway is the sole enforcer. Kept in sync (by hand) with the
   * engine-client `Agent` shape.
   */
  access?: "manager" | "user";
  /**
   * Teams v2: the full assignee list with per-person access level. Populated
   * only for callers who may manage assignments (owner or agent-manager);
   * absent in single-player mode. `assignedUserIds` mirrors these user ids for
   * back-compat.
   */
  assignments?: { userId: string; access: "manager" | "user" }[];
}

/** Props injected into every tab component */
export interface TabProps {
  agent: Agent;
  agentDef: AgentDefinition;
}

/** Skill summary returned by list_skills */
export interface SkillSummary {
  name: string;
  /**
   * Display title from frontmatter `title:` — accents/casing the directory
   * slug can't carry (translated store skills). Null → humanize the slug.
   */
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  last_used: string | null;
  /** Optional user-facing category (e.g. "Email"). Groups skills in the New Mission picker. */
  category: string | null;
  /** Surface on the Featured tab of the New Mission picker. */
  featured: boolean;
  /** Legacy toolkit slugs declared in skill frontmatter (display-only metadata). */
  integrations: string[];
  /** Image URL or Microsoft Fluent 3D Emoji slug (e.g. "rocket"). */
  image: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  prompt_template: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  /** Options for `type: select`. Empty for text/textarea. */
  options?: string[];
}

/** Skill detail returned by load_skill */
export interface SkillDetail {
  name: string;
  /** Display title from frontmatter `title:`; null → humanize the slug. */
  title: string | null;
  description: string;
  version: number;
  content: string;
}

/** Community skill search result */
export interface CommunitySkillResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** A skill discovered in a GitHub repo */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

/** File entry returned by list_project_files */
export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory?: boolean;
  dateModified?: number;
}
