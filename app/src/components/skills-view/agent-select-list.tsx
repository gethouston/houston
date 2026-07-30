import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { Agent } from "../../lib/types";

/**
 * The multi-select agent list the global Skills dialogs share (HOU-792): one
 * always-visible row per agent with a trailing check ring — pressed state, not
 * hover-revealed. Locked rows (e.g. "already has this skill") keep their
 * avatar+name but swap the ring for a muted note and don't toggle.
 */
export function AgentSelectList({
  agents,
  selected,
  onToggle,
  lockedIds,
  lockedNote,
}: {
  agents: Agent[];
  /** Selected agent ids. */
  selected: ReadonlySet<string>;
  onToggle: (agent: Agent) => void;
  /** Agents that can't be toggled; they render `lockedNote` instead of a ring. */
  lockedIds?: ReadonlySet<string>;
  lockedNote?: string;
}) {
  return (
    <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
      {agents.map((agent) => {
        const locked = lockedIds?.has(agent.id) ?? false;
        const checked = !locked && selected.has(agent.id);
        return (
          <li key={agent.id}>
            <button
              type="button"
              aria-pressed={checked}
              disabled={locked}
              onClick={() => onToggle(agent)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors",
                locked ? "opacity-60" : "hover:bg-hover",
              )}
            >
              <HoustonAvatar
                color={resolveAgentColor(agent.color)}
                diameter={24}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {agent.name}
              </span>
              {locked ? (
                <span className="shrink-0 text-xs text-ink-muted">
                  {lockedNote}
                </span>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    checked
                      ? "border-action bg-action text-action-text"
                      : "border-line-input",
                  )}
                >
                  {checked && <Check className="size-3.5" />}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
