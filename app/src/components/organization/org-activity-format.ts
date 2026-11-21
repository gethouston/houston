import type { AuditEntry } from "@houston/engine-adapter";

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

export interface AuditResolvers {
  actor: string;
  agent: string;
  member(userId: string): string;
  role(role: string): string;
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
