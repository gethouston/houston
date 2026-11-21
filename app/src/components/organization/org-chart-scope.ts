import type { Agent, OrgRole } from "@houston/engine-adapter";
import type { OrgChartUsage, OrgChartWork } from "./org-chart-model.ts";
import type { LedgerLine, OrgChartRead } from "./org-chart-view-model.ts";

export type OrgChartScope = "org" | "yours" | "personal";

export function orgChartScope(input: {
  role: OrgRole;
  personal: boolean;
}): OrgChartScope {
  if (input.personal) return "personal";
  return input.role === "owner" ? "org" : "yours";
}

export function messagesCounted(
  agent: Pick<Agent, "access">,
  scope: OrgChartScope,
): boolean {
  return scope !== "yours" || agent.access === "manager";
}

export interface HeroFigures {
  scope: OrgChartScope;
  agents: number;
  people: number | null;
  workMs: number | null;
  messages: number | null;
  messagesScoped: boolean;
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

export function heroFigures(input: {
  scope: OrgChartScope;
  lines: readonly LedgerLine[];
  people: number;
  work: OrgChartWork | null;
  usage: OrgChartUsage | null;
}): HeroFigures {
  const { scope, lines } = input;
  const counted = lines.flatMap((line) =>
    line.messages === null ? [] : [line.messages],
  );
  return {
    scope,
    agents: lines.length,
    people: scope === "org" ? input.people : null,
    workMs: input.work ? sum(lines.map((line) => line.workMs)) : null,
    messages: input.usage && counted.length > 0 ? sum(counted) : null,
    messagesScoped: counted.length < lines.length,
  };
}

export function heroMessagesRead(
  read: OrgChartRead,
  total: number | null,
): OrgChartRead {
  return read === "ready" && total === null ? "hidden" : read;
}
