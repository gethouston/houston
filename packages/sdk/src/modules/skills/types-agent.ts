/**
 * Wire types for an agent's OWN skills — the procedures that live in one
 * agent's `.agents/skills/` — plus that agent's skills manifest, and the
 * command vocabulary the bridge dispatches them by.
 *
 * Everything here is agent-scoped: every operation names an agent id. The
 * workspace-wide shared library and the marketplace are separate families with
 * their own types in this module.
 */

import type { HttpScope } from "../http";

/**
 * The write vocabulary — the same constants back the facade and the bridge.
 *
 * Each value spells the operation's own function name rather than a short verb
 * (`skills/listSkills`, not `skills/list`), because the sibling shared-skill
 * and marketplace families dispatch under the same `skills/` prefix and a short
 * verb would collide with theirs.
 */
export const AgentSkillsCommand = {
  List: "skills/listSkills",
  Load: "skills/loadSkill",
  Create: "skills/createSkill",
  Save: "skills/saveSkill",
  Delete: "skills/deleteSkill",
  GetManifest: "skills/getSkillsManifest",
  PutManifest: "skills/putSkillsManifest",
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
   *  in (HOU-791). Forward link; the durable reverse link is the activity's
   *  `skill_slug`. */
  setupActivityId?: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  promptTemplate: string | null;
}

/** A summary exactly as the host sends it: without the two legacy fields. */
export type HostSkillSummary = Omit<SkillSummary, "inputs" | "promptTemplate">;

/**
 * The host dropped the legacy structured-inputs/prompt-template fields (every
 * surface ignores them); restore them as empty so the v1 {@link SkillSummary}
 * consumers still compile against reaches callers unchanged.
 */
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
export class AgentSkillsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentSkillsHttpError";
  }
}

/**
 * The scope every agent-skills request runs in: the engine base (trailing
 * slashes trimmed), the injected ports, the shared 401 signal, and the error
 * type a caller catches.
 */
export function agentSkillsScope(
  baseUrl: string,
  ports: HttpScope["ports"],
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new AgentSkillsHttpError(
        message || `skills request failed: ${status}`,
        status,
      ),
  };
}

/** A required non-empty string off an untrusted command payload. */
export function requireString(payload: unknown, key: string): string {
  const value =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)[key]
      : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/** A required object off an untrusted command payload, by key. */
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

/** The new skill off an untrusted command payload. */
export function requireNewSkill(payload: unknown, key: string): NewSkill {
  const value = requireObject(payload, key);
  return {
    name: requireString(value, "name"),
    description: requireString(value, "description"),
    content: requireString(value, "content"),
  };
}

/**
 * The manifest off an untrusted command payload.
 *
 * Every omitted slug is a DISABLED skill, so a payload whose `enabled` is not a
 * list of strings must be refused rather than coerced — silently dropping an
 * entry would switch that skill off for the agent.
 */
export function requireManifest(payload: unknown, key: string): SkillsManifest {
  const value = requireObject(payload, key);
  const enabled = value.enabled;
  if (!Array.isArray(enabled) || enabled.some((s) => typeof s !== "string")) {
    throw new Error(`'${key}.enabled' must be a list of slugs`);
  }
  return { version: 1, enabled: enabled as string[] };
}
