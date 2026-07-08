import type { ConnectFlow } from "../../integrations";
import { AgentAppRow } from "./agent-app-row";
import type { AgentAppRow as AgentAppRowVM } from "./model";

/** Header + empty-state copy for the section (mode-specific, chosen by the tab). */
export interface AppsSectionCopy {
  title: string;
  subtitle?: string;
  emptyTitle: string;
  emptyBody: string;
}

interface AgentAppsSectionProps {
  copy: AppsSectionCopy;
  rows: AgentAppRowVM[];
  canEdit: boolean;
  connectFlow: ConnectFlow;
  /** Grants mode only: drop this agent's grant for an active account. */
  onDeactivate?: (connectionId: string) => void;
  onRemove: (connectionId: string) => void;
  /** Re-run the connect flow for a toolkit to link another login of it. */
  onAddAccount?: (toolkit: string) => void;
}

/**
 * The list of this agent's apps in a two-column grid, shared by both modes. An
 * empty list becomes a quiet empty state pointing at the always-visible catalog
 * below (no add button here — connecting lives in "Connect more apps"). Read-only
 * viewers see the rows and their live status but no mutating affordances.
 */
export function AgentAppsSection({
  copy,
  rows,
  canEdit,
  connectFlow,
  onDeactivate,
  onRemove,
  onAddAccount,
}: AgentAppsSectionProps) {
  return (
    <section className="mt-6">
      <div className="mb-3 min-w-0">
        <h2 className="text-sm font-medium text-foreground">{copy.title}</h2>
        {copy.subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {copy.subtitle}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl bg-secondary px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {copy.emptyTitle}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {copy.emptyBody}
          </p>
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
              onAddAccount={onAddAccount}
            />
          ))}
        </div>
      )}
    </section>
  );
}
