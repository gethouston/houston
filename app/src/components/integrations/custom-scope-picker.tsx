import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";

/**
 * The Integrations page's "whose custom integrations" pill (PRODUCT-1773):
 * on a per-agent deployment (one pod per agent) the custom list the page
 * shows belongs to ONE agent, and this control names which. The same pill
 * idiom as the phone Agents home's team filter; the visible text is the
 * control's name. Rendered only where the choice exists (per-agent scope,
 * more than one agent) — a single-agent workspace or a shared host has
 * nothing to pick.
 */
export function CustomScopePicker({
  agents,
  selected,
  onSelect,
  compact,
}: {
  agents: readonly Agent[];
  selected: Agent;
  onSelect: (agentId: string) => void;
  compact: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="custom-scope-picker"
          title={t("custom.scope.title")}
          className={cn(
            // Capped so a long agent name never squeezes the search field out
            // of the sticky strip on a phone (that row does not wrap).
            "ht-hairline inline-flex max-w-40 shrink-0 items-center gap-2 rounded-full md:max-w-64 bg-chip pr-3 pl-3 text-[13px] font-weight-510 text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            compact ? "h-8" : "h-9",
          )}
        >
          <HoustonAvatar
            color={resolveAgentColor(selected.color)}
            diameter={16}
          />
          <span className="min-w-0 truncate">
            {t("custom.scope.label", { agent: selected.name })}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup value={selected.id} onValueChange={onSelect}>
          {agents.map((agent) => (
            <DropdownMenuRadioItem
              key={agent.id}
              value={agent.id}
              data-testid="custom-scope-option"
              className="gap-2"
            >
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={16}
              />
              <span className="min-w-0 truncate">{agent.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
