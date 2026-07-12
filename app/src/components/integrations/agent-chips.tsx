import {
  HoustonAvatar,
  resolveAgentColor,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AgentChip } from "./agent-chip";

/**
 * A compact row of agent avatar chips with an overflow "+N" pill. Used by the
 * global page to show which agents can use an app. Each chip carries the agent
 * name in a tooltip; an empty list renders `emptyLabel` (or nothing).
 */
export function AgentChips({
  agents,
  max = 5,
  emptyLabel,
}: {
  agents: AgentChip[];
  max?: number;
  emptyLabel?: string;
}) {
  const { t } = useTranslation("integrations");
  if (agents.length === 0) {
    return emptyLabel ? (
      <span className="text-xs text-ink-muted">{emptyLabel}</span>
    ) : null;
  }

  const shown = agents.slice(0, max);
  const overflow = agents.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((agent) => (
        <Tooltip key={agent.id}>
          <TooltipTrigger asChild>
            <span className="rounded-full ring-2 ring-input">
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={20}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{agent.name}</TooltipContent>
        </Tooltip>
      ))}
      {overflow > 0 && (
        <span className="inline-flex h-5 items-center rounded-full bg-chip px-1.5 text-[11px] font-medium text-ink-muted ring-2 ring-input">
          {t("chips.more", { count: overflow })}
        </span>
      )}
    </div>
  );
}
