import { SdkHttpError } from "../http";
import { requireString } from "../payload";

export const AgentSkillsCommand = {
  List: "skills/list",
  Load: "skills/load",
  Create: "skills/create",
  Save: "skills/save",
  Delete: "skills/delete",
  GetManifest: "skills/getManifest",
  PutManifest: "skills/putManifest",
  SetEnabled: "skills/setEnabled",
  RevertOverride: "skills/revertOverride",
  DisableForAgent: "skills/disableForAgent",
  DiscardDraft: "skills/discardDraft",
} as const;

export type AgentSkillsCommandType =
  (typeof AgentSkillsCommand)[keyof typeof AgentSkillsCommand];

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  options?: string[];
}

export interface SkillSummary {
  name: string;
  title: string | null;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  category: string | null;
  featured: boolean;
  integrations: string[];
  image: string | null;
  setupActivityId?: string | null;
  inputs: SkillInputDef[];
  promptTemplate: string | null;
}

export type HostSkillSummary = Omit<SkillSummary, "inputs" | "promptTemplate">;

export function toClientSummary(summary: HostSkillSummary): SkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

export interface SkillDetail {
  name: string;
  title: string | null;
  description: string;
  version: number;
  content: string;
}

export interface SkillsManifest {
  version: 1;
  enabled: string[];
}

export interface NewSkill {
  name: string;
  description: string;
  content: string;
}

export class AgentSkillsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "AgentSkillsHttpError");
  }
}

function requireObject(payload: unknown, key: string): Record<string, unknown> {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "object" || value === null) {
    throw new Error(`missing '${key}'`);
  }
  return value as Record<string, unknown>;
}

export function requireNewSkill(payload: unknown, key: string): NewSkill {
  const value = requireObject(payload, key);
  return {
    name: requireString(value, "name"),
    description: requireString(value, "description"),
    content: requireString(value, "content"),
  };
}

export function requireManifest(payload: unknown, key: string): SkillsManifest {
  const value = requireObject(payload, key);
  const enabled = value.enabled;
  if (!Array.isArray(enabled) || enabled.some((s) => typeof s !== "string")) {
    throw new Error(`'${key}.enabled' must be a list of slugs`);
  }
  return { version: 1, enabled: enabled as string[] };
}
