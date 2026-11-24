import { SdkHttpError } from "../http";
import { requireString } from "../payload";

/**
 * The write vocabulary — the same constants back the facade and `dispatch`.
 *
 * Every command in the SDK is `<family>/<verb>`, so an agent's own skills are
 * plain `skills/*`. The sibling family names itself apart in the family half
 * (`skills.shared/*`) rather than by repeating the noun in each verb.
 */
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

/** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
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

/** One skill as a list renders it — everything but its instructions. */
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
  lastUsed: string | null;
  /** Optional user-facing category. Drives grouping in the "New mission" picker. */
  category: string | null;
  /** Surface this skill on the Featured tab of the "New mission" picker. */
  featured: boolean;
  /** Composio toolkit slugs this skill touches (e.g. ["gmail", "slack"]). */
  integrations: string[];
  /** Image URL or Microsoft Fluent Emoji slug (e.g. "rocket"). */
  image: string | null;
  /** Frontmatter `setup_activity_id:` — the setup chat this skill was built
   *  in. Forward link; the durable reverse link is the activity's
   *  `skill_slug`. */
  setupActivityId?: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  promptTemplate: string | null;
}

/** A summary exactly as the host sends it: without the two legacy fields. */
export type HostSkillSummary = Omit<SkillSummary, "inputs" | "promptTemplate">;

export function toClientSummary(summary: HostSkillSummary): SkillSummary {
  return { ...summary, inputs: [], promptTemplate: null };
}

/** One skill's full detail, including its SKILL.md text. */
export interface SkillDetail {
  name: string;
  /** Display title from frontmatter `title:`; null → humanize the slug. */
  title: string | null;
  description: string;
  version: number;
  content: string;
}

/**
 * Per-agent enablement of workspace-shared skills (ADR 0003). A shared skill
 * remains disabled until its slug appears here; agent-local skills always load
 * and shadow shared skills with the same slug.
 */
export interface SkillsManifest {
  version: 1;
  enabled: string[];
}

/** The body of `POST /agents/:id/skills`. */
export interface NewSkill {
  name: string;
  description: string;
  content: string;
}

/** A failed agent-skills request. `status` is the upstream HTTP status. */
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
