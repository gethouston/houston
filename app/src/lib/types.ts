import type { SkillWorkflow } from "@houston/protocol";

export type { SkillWorkflow, SkillWorkflowStep } from "@houston/protocol";

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  locale?: string | null;
}

export type AgentCategory =
  | "productivity"
  | "development"
  | "research"
  | "creative"
  | "business";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;
  image?: string;
  color?: string;
  category?: AgentCategory;
  author?: string;
  tags?: string[];
  integrations?: string[];
  claudeMd?: string;
  systemPrompt?: string;
  agentSeeds?: Record<string, string>;
  features?: string[];
}

export interface AgentDefinition {
  config: AgentConfig;
  source: "builtin" | "installed";
  path?: string;
}

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  role?: string;
  createdAt: string;
  lastOpenedAt?: string;
  localDir?: string;
  assigned?: boolean;
  assignedUserIds?: string[];
  access?: "manager" | "user";
  assignments?: { userId: string; access: "manager" | "user" }[];
}

export interface SkillSummary {
  name: string;
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  last_used: string | null;
  category: string | null;
  featured: boolean;
  integrations: string[];
  image: string | null;
  setup_activity_id?: string | null;
  inputs: SkillInputDef[];
  prompt_template: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  options?: string[];
}

export interface SkillDetail {
  name: string;
  title: string | null;
  description: string;
  version: number;
  content: string;
  workflow?: SkillWorkflow | null;
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory?: boolean;
  dateModified?: number;
}
