/**
 * Wire types, command vocabulary and facade contract for WORKSPACE-shared
 * skills — the library every agent in a space can draw from. Per-agent skills
 * are a different family and carry their own types.
 *
 * The summary a shared skill lists under is the protocol's {@link SkillSummary}
 * widened with v1's structured-inputs and prompt-template fields. The host
 * stores neither (protocol v3 dropped them and the composer ignores them), so
 * `shared-skills.ts` fills them in as empty: the surfaces that render a shared
 * skill type them, and handing them a narrower row would push the same two
 * defaults into every caller.
 */

import type { SkillDetail, SkillSummary } from "@houston/protocol";
import { SdkHttpError } from "../http";
import { field, requireString } from "../payload";
import type { SkillInputDef } from "./types-agent";

export type { SkillDetail };

/** The command vocabulary — the same constants back the facade and `dispatch`. */
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

/**
 * A failed shared-skills request. `status` is the upstream HTTP status, so a
 * caller that wants a degradation (an absent library, an unknown slug) reads
 * it and decides for itself.
 */
export class SharedSkillsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "SharedSkillsHttpError");
  }
}

/** One shared skill as the workspace library lists it. */
export interface SharedSkillSummary extends SkillSummary {
  /** Legacy structured inputs. Always empty — the host keeps none. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Always null, for the same reason. */
  promptTemplate: string | null;
}

/** One entry of the library that could not be read, named with why. */
export interface SharedSkillDiagnostic {
  key: string;
  message: string;
}

/** The workspace library: what loaded, and what did not. */
export interface SharedSkillsList {
  items: SharedSkillSummary[];
  diagnostics: SharedSkillDiagnostic[];
}

/** The library exactly as the host sends it — v3 rows carry no legacy fields. */
export interface HostSharedSkillsList {
  items: SkillSummary[];
  diagnostics: SharedSkillDiagnostic[];
}

/** The three fields a new shared skill is created from. */
export interface NewSharedSkill {
  name: string;
  description: string;
  content: string;
}

/** A host row as the client shape: the two fields v3 dropped, restored empty. */
export function toSharedSummary(summary: SkillSummary): SharedSkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

/** The typed facade for the workspace-shared skill library. */
export interface SharedSkillsModule {
  /** Everything shared with the workspace, plus what failed to load. */
  listSharedSkills(workspaceId: string): Promise<SharedSkillsList>;
  /** One shared skill's instructions, by its slug. */
  loadSharedSkill(workspaceId: string, slug: string): Promise<SkillDetail>;
  /** Create a skill and share it with everyone in the workspace. */
  createSharedSkill(
    workspaceId: string,
    body: NewSharedSkill,
  ): Promise<SkillDetail>;
  /** Share an agent's existing skill, under `slug`, with the workspace. */
  promoteSharedSkill(
    workspaceId: string,
    slug: string,
    content: string,
  ): Promise<SkillDetail>;
  /** Replace a shared skill's text for everyone who uses it. */
  saveSharedSkill(
    workspaceId: string,
    slug: string,
    content: string,
  ): Promise<void>;
  /** Remove a shared skill from the workspace. */
  deleteSharedSkill(workspaceId: string, slug: string): Promise<void>;
}

/**
 * A new shared skill off an untrusted command payload. `description` may be
 * empty — the host accepts a skill with no one-liner — so only the two fields
 * the library cannot list without are demanded.
 */
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
