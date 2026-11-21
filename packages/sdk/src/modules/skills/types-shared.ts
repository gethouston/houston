import type { SkillDetail, SkillSummary } from "@houston/protocol";
import { SdkHttpError } from "../http";
import { field, requireString } from "../payload";
import type { SkillInputDef } from "./types-agent";

export type { SkillDetail };

export const SharedSkillsCommand = {
  List: "skills.shared/list",
  Load: "skills.shared/load",
  Create: "skills.shared/create",
  Promote: "skills.shared/promote",
  Save: "skills.shared/save",
  Delete: "skills.shared/delete",
} as const;

export type SharedSkillsCommandType =
  (typeof SharedSkillsCommand)[keyof typeof SharedSkillsCommand];

export class SharedSkillsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "SharedSkillsHttpError");
  }
}

export interface SharedSkillSummary extends SkillSummary {
  inputs: SkillInputDef[];
  promptTemplate: string | null;
}

export interface SharedSkillDiagnostic {
  key: string;
  message: string;
}

export interface SharedSkillsList {
  items: SharedSkillSummary[];
  diagnostics: SharedSkillDiagnostic[];
}

export interface HostSharedSkillsList {
  items: SkillSummary[];
  diagnostics: SharedSkillDiagnostic[];
}

export interface NewSharedSkill {
  name: string;
  description: string;
  content: string;
}

export function toSharedSummary(summary: SkillSummary): SharedSkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

export interface SharedSkillsModule {
  listSharedSkills(workspaceId: string): Promise<SharedSkillsList>;
  loadSharedSkill(workspaceId: string, slug: string): Promise<SkillDetail>;
  createSharedSkill(
    workspaceId: string,
    body: NewSharedSkill,
  ): Promise<SkillDetail>;
  promoteSharedSkill(
    workspaceId: string,
    slug: string,
    content: string,
  ): Promise<SkillDetail>;
  saveSharedSkill(
    workspaceId: string,
    slug: string,
    content: string,
  ): Promise<void>;
  deleteSharedSkill(workspaceId: string, slug: string): Promise<void>;
}

export function requireNewSharedSkill(
  payload: unknown,
  key: string,
): NewSharedSkill {
  const body = field(payload, key);
  const description = field(body, "description");
  return {
    name: requireString(body, "name"),
    description: typeof description === "string" ? description : "",
    content: requireString(body, "content"),
  };
}
