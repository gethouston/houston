import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { sectionFilterAgent } from "./team-agent-filter-model";

/**
 * "Whose work am I looking at" — for ONE section, owned by that section.
 *
 * Routines and the archive each render one of these in the strip's right zone,
 * beside their other controls, in the same 32px ghost capsule the person
 * filter wears: the whole zone is one row of Safari capsules and a filter must
 * not read as a different species of control from the filter next to it.
 *
 * **Its state is the SECTION's, not the team's.** It is a plain `useState`
 * where it is mounted, deliberately NOT the store's `teamAgentFilter`: that
 * pin is the RAIL's act — clicking an agent means "show me this agent's
 * board" — and letting a section's own dropdown write it made narrowing one
 * list silently narrow every other surface the team has, including the one the
 * user would return to. Tabs therefore always open a section team-wide, which
 * is the honest default for a list whose whole job is to aggregate.
 *
 * Props only: no store, no capabilities. The caller holds the state and says
 * what the choices are.
 */
export function TeamAgentFilterCapsule({
  agents,
  selectedAgentId,
  onSelect,
}: {
  /** The whole team: the menu offers every member, not just the shown one. */
  agents: Agent[];
  /** The section's current choice, `null` for the whole team. */
  selectedAgentId: string | null;
  onSelect: (agentId: string | null) => void;
}) {
  const { t } = useTranslation("dashboard");
  // Resolved through the shared rule, so an id the team no longer holds shows
  // as "All agents" instead of a name nobody can pick again.
  const selected = sectionFilterAgent(agents, selectedAgentId);
  const allAgents = t("filter.allAgents");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* No `aria-label`: the visible text IS the control's name, and one
            that said something else would hide the current choice from anyone
            not looking at the screen. */}
        <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
          {selected && <AgentCardAvatar color={selected.color} />}
          <span className="max-w-[10rem] truncate">
            {selected ? selected.name : allAgents}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect(null)}>
          {allAgents}
        </DropdownMenuItem>
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            className="gap-2"
            onClick={() => onSelect(agent.id)}
          >
            <AgentCardAvatar color={agent.color} />
            {agent.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
