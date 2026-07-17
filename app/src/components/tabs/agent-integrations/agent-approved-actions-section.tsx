import { humanizeActionSlug } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentActionApprovals,
  useRevokeActionApproval,
} from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { AppRow } from "../../integrations";
import { integrationsSupported } from "../../integrations/model";
import { useIntegrationAppDisplay } from "../../use-integration-app-display";
import { toolkitOfActionSlug } from "./approved-actions-model";

interface AgentApprovedActionsSectionProps {
  /** This agent, for the approvals query + revoke mutation. */
  agentId: string;
  /** The toolkit catalog, so a bare action slug resolves to its app identity. */
  catalog: IntegrationToolkit[];
}

/**
 * The "Runs without asking" review section: the integration actions the user
 * chose "Always allow" for on this agent's chat approval card, with a visible
 * Remove per row that revokes the always-allow so Houston asks again next time.
 * Until now the always list could only GROW (written from the card) with no
 * place to review or undo it — this is the revoke surface. Self-gates on the
 * approvals query: it renders nothing while the list is empty (and while a host
 * without the gate degrades it to `[]`), so the tab shows it only when there is
 * something to review.
 */
export function AgentApprovedActionsSection({
  agentId,
  catalog,
}: AgentApprovedActionsSectionProps) {
  const { t } = useTranslation("integrations");
  const { capabilities } = useCapabilities();
  const approvals = useAgentActionApprovals(
    agentId,
    integrationsSupported(capabilities),
  );
  const revoke = useRevokeActionApproval(agentId);
  const slugs = useMemo(() => catalog.map((tk) => tk.slug), [catalog]);
  const actions = approvals.data ?? [];
  if (actions.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-medium text-ink">
        {t("agentTab.runsWithoutAsking.heading")}
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-ink-muted">
        {t("agentTab.runsWithoutAsking.subtitle")}
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <ApprovedActionRow
            key={action}
            action={action}
            toolkit={toolkitOfActionSlug(action, slugs)}
            onRemove={() => revoke.mutate(action)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One always-allowed action: the app's logo + name (resolved read-only via
 * {@link useIntegrationAppDisplay}) with the HUMANIZED action as the row text,
 * and an outline Remove button (visible at rest, never hover-gated).
 */
function ApprovedActionRow({
  action,
  toolkit,
  onRemove,
}: {
  action: string;
  toolkit: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation("integrations");
  const app = useIntegrationAppDisplay(toolkit);
  const humanized = humanizeActionSlug(action, toolkit);
  return (
    <AppRow
      display={app}
      description={humanized}
      trailing={
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("agentTab.runsWithoutAsking.removeFor", {
            action: humanized,
          })}
          onClick={onRemove}
        >
          {t("agentTab.runsWithoutAsking.remove")}
        </Button>
      }
    />
  );
}
