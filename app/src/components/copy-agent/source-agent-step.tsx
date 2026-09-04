import {
  cn,
  HoustonAvatar,
  resolveAgentColor,
  Spinner,
} from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";

/**
 * First screen of "Copy an agent": which of your agents is the model. One row
 * per agent, the helmet in its own color so the list reads like the rail.
 * Picking a row reads that agent's shareable content; the row shows a spinner
 * while it loads and the wizard moves on by itself when it arrives.
 */
export function SourceAgentStep({
  agents,
  loadingId,
  onPick,
}: {
  agents: readonly Agent[];
  /** The agent whose content is being read, if any. Locks the list. */
  loadingId: string | null;
  onPick: (agent: Agent) => void;
}) {
  const { t } = useTranslation("agents");
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] font-normal leading-tight text-balance">
          {t("copyAgent.wizard.source.title")}
        </h1>
        <p className="mt-3 text-base text-ink-muted">
          {t("copyAgent.wizard.source.body")}
        </p>
      </header>
      {agents.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t("copyAgent.wizard.source.empty")}
        </p>
      ) : (
        <ul className="space-y-1" data-testid="copy-agent-sources">
          {agents.map((agent) => {
            const loading = loadingId === agent.id;
            return (
              <li key={agent.id}>
                <button
                  type="button"
                  disabled={loadingId !== null}
                  aria-busy={loading || undefined}
                  onClick={() => onPick(agent)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-200",
                    "hover:bg-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus/50",
                    "disabled:pointer-events-none",
                    loadingId !== null && !loading && "opacity-50",
                  )}
                >
                  <HoustonAvatar
                    color={resolveAgentColor(agent.color)}
                    diameter={36}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {agent.name}
                  </span>
                  {loading ? (
                    <Spinner className="size-4 shrink-0 text-ink-muted" />
                  ) : (
                    <ChevronRight
                      className="size-4 shrink-0 text-ink-muted"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
