import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "../../integrations";
import { AgentAppRow } from "./agent-app-row";
import type { AgentAppRow as AgentAppRowVM } from "./model";

/** Header + empty-state copy for the section (mode-specific, chosen by the tab). */
export interface AppsSectionCopy {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
}

interface AgentAppsSectionProps {
  copy: AppsSectionCopy;
  rows: AgentAppRowVM[];
  canEdit: boolean;
  connectFlow: ConnectFlow;
  /** Grants mode only: drop this agent's grant for an active app. */
  onDeactivate?: (toolkit: string) => void;
  onRemove: (toolkit: string) => void;
  onAddApps: () => void;
}

/**
 * The list of apps for this agent, shared by both modes. The header carries a
 * prominent Add-apps action (editors only); an empty list becomes a full empty
 * state with the same call to action. Read-only viewers see the rows and their
 * live status but no mutating affordances.
 */
export function AgentAppsSection({
  copy,
  rows,
  canEdit,
  connectFlow,
  onDeactivate,
  onRemove,
  onAddApps,
}: AgentAppsSectionProps) {
  const { t } = useTranslation("integrations");

  const addButton = canEdit ? (
    <button
      type="button"
      onClick={onAddApps}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
    >
      <Plus className="size-3.5" />
      {t("agentTab.addApps")}
    </button>
  ) : null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">{copy.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>
        {rows.length > 0 && addButton}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-secondary px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {copy.emptyTitle}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {copy.emptyBody}
          </p>
          {canEdit && (
            <div className="mt-4 flex justify-center">{addButton}</div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <AgentAppRow
              key={row.connection.connectionId || row.connection.toolkit}
              row={row}
              connectFlow={connectFlow}
              canEdit={canEdit}
              onDeactivate={onDeactivate}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </section>
  );
}
