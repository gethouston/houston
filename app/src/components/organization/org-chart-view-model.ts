import type { Agent, OrgMember } from "@houston/engine-adapter";
import type { OrgChartUsage, OrgChartWork } from "./org-chart-model.ts";
import { type AgentPeople, agentPeople } from "./org-chart-people.ts";
import { messagesCounted, type OrgChartScope } from "./org-chart-scope.ts";

/**
 * The org chart as data: the ledger of AI Employees ranked by the hours they
 * worked, each with its people, and which figure leads the hero when time
 * worked cannot be read. Pure and DOM-free.
 */

/**
 * Where one read stands. `hidden` is a read this caller or deployment does
 * not get at all (time worked off the hosted cloud, message usage for a
 * non-admin): its numbers go away rather than reading as zeroes. A read
 * that never landed is `loading` even while its query is parked off screen,
 * so no figure is ever drawn from data that is not there.
 */
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

/** The figure the hero leads with and the ledger's bars measure. */
export type OrgChartMetric = "hours" | "messages";

export interface OrgChartLead {
  metric: OrgChartMetric;
  loading: boolean;
}

/**
 * Hours lead whenever time worked is on, holding a skeleton while it loads
 * rather than flashing messages first. Hidden or failed hours hand the lead
 * to messages; with neither readable there is no figure at all.
 */
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

/**
 * The ledger's columns. The bar column carries the lead metric; messages get
 * their own column only beside hours (when they lead, the bar is theirs).
 * A personal space has one person, so it draws no people columns.
 */
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
  /** The role its job description names, when it has one. */
  role?: string;
  color?: string;
  workMs: number;
  /** `null` where the gateway does not count its messages for this caller. */
  messages: number | null;
  /** Its bar against the top AI Employee by the lead metric, 0 to 1. */
  share: number;
  /** `null` when the caller cannot see who it is assigned to. */
  people: AgentPeople | null;
}

/**
 * The people of one agent, its users ordered by who talks to it most over
 * the window, then by name, so the faces that show first are the ones that
 * use it.
 */
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

/**
 * One line per agent, ranked by hours worked with messages breaking ties,
 * by messages alone when hours are not readable, then by name. A read that
 * is not there, or a count the caller is not served, ranks as zero; the
 * lines never draw it as one.
 */
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

/** Past this many AI Employees the ledger tightens and, when wide, splits. */
export const DENSE_LEDGER = 8;
