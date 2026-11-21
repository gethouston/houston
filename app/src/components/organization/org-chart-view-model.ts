import type { Agent, OrgMember } from "@houston/engine-adapter";
import type { OrgChartUsage, OrgChartWork } from "./org-chart-model.ts";
import { type AgentPeople, agentPeople } from "./org-chart-people.ts";
import { messagesCounted, type OrgChartScope } from "./org-chart-scope.ts";

export type OrgChartRead = "hidden" | "loading" | "error" | "ready";

export function orgChartRead(input: {
  enabled: boolean;
  hasData: boolean;
  isError: boolean;
}): OrgChartRead {
  if (!input.enabled) return "hidden";
  if (input.hasData) return "ready";
  return input.isError ? "error" : "loading";
}

export type OrgChartState = "loading" | "empty" | "ready";

export function orgChartState(input: {
  agentsLoaded: boolean;
  agentCount: number;
}): OrgChartState {
  if (!input.agentsLoaded) return "loading";
  return input.agentCount > 0 ? "ready" : "empty";
}

export type OrgChartMetric = "hours" | "messages";

export interface OrgChartLead {
  metric: OrgChartMetric;
  loading: boolean;
}

export function orgChartLead(
  hours: OrgChartRead,
  messages: OrgChartRead,
): OrgChartLead | null {
  if (hours === "ready" || hours === "loading")
    return { metric: "hours", loading: hours === "loading" };
  if (messages === "ready" || messages === "loading")
    return { metric: "messages", loading: messages === "loading" };
  return null;
}

export interface LedgerColumns {
  bar: OrgChartLead | null;
  messages: "ready" | "loading" | null;
  people: boolean;
}

export function ledgerColumns(
  lead: OrgChartLead | null,
  messages: OrgChartRead,
  personal: boolean,
): LedgerColumns {
  const beside =
    lead?.metric === "hours" &&
    (messages === "ready" || messages === "loading");
  return { bar: lead, messages: beside ? messages : null, people: !personal };
}

export interface LedgerLine {
  id: string;
  name: string;
  role?: string;
  color?: string;
  workMs: number;
  messages: number | null;
  share: number;
  people: AgentPeople | null;
}

function peopleOf(
  agent: Agent,
  members: readonly OrgMember[],
  talked: ReadonlyMap<string, number>,
  unnamedAccount: string,
): AgentPeople | null {
  const people = agentPeople(agent, members, unnamedAccount);
  if (people === null || people.uses === "everyone") return people;
  const uses = [...people.uses].sort(
    (a, b) => (talked.get(b.userId) ?? 0) - (talked.get(a.userId) ?? 0),
  );
  return { manages: people.manages, uses };
}

export function buildLedger(
  agents: readonly Agent[],
  members: readonly OrgMember[],
  reads: {
    work: OrgChartWork | null;
    usage: OrgChartUsage | null;
    scope: OrgChartScope;
    unnamedAccount: string;
  },
): LedgerLine[] {
  const lines = agents.map((agent) => {
    const usage = reads.usage?.byAgent.get(agent.id);
    const talked = new Map(
      (usage?.talkers ?? []).map((t) => [t.userId, t.messages]),
    );
    const counted = messagesCounted(agent, reads.scope);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role?.trim() || undefined,
      color: agent.color,
      workMs: reads.work?.byAgent.get(agent.id) ?? 0,
      messages: counted ? (usage?.total ?? 0) : null,
      share: 0,
      people: peopleOf(agent, members, talked, reads.unnamedAccount),
    };
  });
  const messages = (line: LedgerLine) => line.messages ?? 0;
  lines.sort(
    (a, b) =>
      b.workMs - a.workMs ||
      messages(b) - messages(a) ||
      (reads.usage
        ? Number(a.messages === null) - Number(b.messages === null)
        : 0) ||
      a.name.localeCompare(b.name),
  );
  const measure = (line: LedgerLine) =>
    reads.work ? line.workMs : messages(line);
  const top = Math.max(0, ...lines.map(measure));
  return lines.map((line) => ({
    ...line,
    share: top > 0 ? measure(line) / top : 0,
  }));
}

export const DENSE_LEDGER = 8;
