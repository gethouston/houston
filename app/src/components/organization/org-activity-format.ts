import type { AuditEntry } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free translation of an audit-log entry into a human sentence
 * template (Teams v2 Activity feed). Node:test-safe: it returns an i18n
 * `action` key + interpolation `vars`, never a literal string, so the copy
 * stays in the `teams` locale files while the mapping is exhaustively unit
 * tested. The component calls `t(\`activityTab.actions.${action}\`, vars)`.
 *
 * Subject shapes (contract §5, produced by the cloud audit writer) are read
 * DEFENSIVELY — every field is optional and every case degrades to a still-
 * readable sentence if the shape drifts. Assumed shapes:
 *   member.add        { email?, userId?, role }
 *   member.remove     { userId }
 *   member.role       { userId, role }        (role = the new role)
 *   invite.create     { email, role }
 *   invite.revoke     { email }
 *   invite.accept     { role }                (actor = the joining user)
 *   agent.create      agentSlug
 *   agent.rename      { from?, to? }
 *   agent.delete      agentSlug
 *   agent.assignments { count? }              (people with access, if known)
 *   agent.settings    agentSlug
 *   org.settings      —
 *   grants.set        { toolkits?: string[], toolkit?: string }
 *   agent.configure   agentSlug
 */

/** Every sentence key the Activity feed can render (+ `unknown` fallback). */
export type ActivityActionKey =
  | "memberAdd"
  | "memberRemove"
  | "memberRole"
  | "inviteCreate"
  | "inviteRevoke"
  | "inviteAccept"
  | "agentCreate"
  | "agentRename"
  | "agentDelete"
  | "agentAssignments"
  | "agentShared"
  | "agentSettings"
  | "orgSettings"
  | "grantsSet"
  | "agentConfigure"
  | "unknown";

export interface ActivitySentence {
  action: ActivityActionKey;
  vars: Record<string, string | number>;
}

/**
 * Callbacks the formatter uses to turn raw ids/slugs into display strings, so
 * ALL wording logic stays pure + testable (tests pass fakes; the component
 * passes roster + `t()`-backed resolvers).
 */
export interface AuditResolvers {
  /** Display name of the entry's actor. */
  actor: string;
  /** Display name of the entry's agent (from `agentSlug`). */
  agent: string;
  /** Display name for a user id found inside the subject. */
  member(userId: string): string;
  /** Translated role label (Owner / Manager / Member) for a role slug. */
  role(role: string): string;
  /** Humanized, joined app names for a set of toolkit slugs. */
  apps(toolkits: string[]): string;
}

function str(subject: unknown, key: string): string | undefined {
  if (subject && typeof subject === "object" && key in subject) {
    const v = (subject as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function num(subject: unknown, key: string): number | undefined {
  if (subject && typeof subject === "object" && key in subject) {
    const v = (subject as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function toolkits(subject: unknown): string[] {
  if (subject && typeof subject === "object") {
    const list = (subject as Record<string, unknown>).toolkits;
    if (Array.isArray(list))
      return list.filter((x): x is string => typeof x === "string");
    const one = (subject as Record<string, unknown>).toolkit;
    if (typeof one === "string") return [one];
  }
  return [];
}

/** Map one audit entry to its sentence key + interpolation variables. */
export function formatAuditEntry(
  entry: AuditEntry,
  r: AuditResolvers,
): ActivitySentence {
  const { actor, agent } = r;
  const s = entry.subject;

  switch (entry.action) {
    case "member.add": {
      const name = str(s, "email") ?? r.member(str(s, "userId") ?? "");
      return {
        action: "memberAdd",
        vars: { actor, name, role: r.role(str(s, "role") ?? "user") },
      };
    }
    case "member.remove":
      return {
        action: "memberRemove",
        vars: { actor, name: r.member(str(s, "userId") ?? "") },
      };
    case "member.role":
      return {
        action: "memberRole",
        vars: {
          actor,
          name: r.member(str(s, "userId") ?? ""),
          role: r.role(str(s, "role") ?? "user"),
        },
      };
    case "invite.create":
      return {
        action: "inviteCreate",
        vars: {
          actor,
          email: str(s, "email") ?? "",
          role: r.role(str(s, "role") ?? "user"),
        },
      };
    case "invite.revoke":
      return {
        action: "inviteRevoke",
        vars: { actor, email: str(s, "email") ?? "" },
      };
    case "invite.accept":
      return {
        action: "inviteAccept",
        vars: { actor, role: r.role(str(s, "role") ?? "user") },
      };
    case "agent.create":
      return { action: "agentCreate", vars: { actor, agent } };
    case "agent.rename":
      return {
        action: "agentRename",
        vars: {
          actor,
          from: str(s, "from") ?? agent,
          to: str(s, "to") ?? agent,
        },
      };
    case "agent.delete":
      return { action: "agentDelete", vars: { actor, agent } };
    case "agent.assignments": {
      const count = num(s, "count");
      if (count === undefined)
        return { action: "agentAssignments", vars: { actor, agent } };
      return { action: "agentShared", vars: { actor, agent, count } };
    }
    case "agent.settings":
      return { action: "agentSettings", vars: { actor, agent } };
    case "org.settings":
      return { action: "orgSettings", vars: { actor } };
    case "grants.set":
      return {
        action: "grantsSet",
        vars: { actor, agent, apps: r.apps(toolkits(s)) },
      };
    case "agent.configure":
      return { action: "agentConfigure", vars: { actor, agent } };
    default:
      return { action: "unknown", vars: { actor, action: entry.action } };
  }
}
