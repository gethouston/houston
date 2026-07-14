import { Spinner } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { useAllAgentGrants } from "../../hooks/queries/use-all-agent-grants";
import {
  useOrgSettings,
  useSetOrgSettings,
} from "../../hooks/queries/use-org-settings";
import { useAgentStore } from "../../stores/agents";
import { AllowlistEditor, INTEGRATION_PROVIDER } from "../integrations";
import { toolkitAgentIds } from "../integrations/connected-apps-model";
import type { OrgTabProps } from "./organization-view";

/**
 * Organization > Allowed integrations: the org-wide app-allowlist ceiling every
 * agent's effective allowlist derives from. The owner edits it; an admin sees
 * it read-only per the role matrix v2. This is a policy ceiling only — the
 * gateway is the sole enforcer, so the editor just persists the org setting.
 * Connected accounts seed the picker so already-linked apps surface first. The
 * shell gates this view to multiplayer owner/admin, so it never mounts in
 * single-player or for a plain member.
 */
export default function AllowedIntegrationsTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const readOnly = !ctx.isOwner;
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, true);
  const orgSettings = useOrgSettings(true);
  const setOrgSettings = useSetOrgSettings();
  const loading = orgSettings.isLoading || catalog.isLoading;

  // "Used by N agents" impact meta, OWNER ONLY. Honesty constraint: the caller
  // only sees grants for agents visible to them; that is the whole org for the
  // owner but only the assigned agents for an admin, so a non-owner count would
  // be a partial total dressed as a whole. Non-owner => enabled=false, no fetch.
  const agents = useAgentStore((s) => s.agents);
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const grants = useAllAgentGrants(
    agentIds,
    ctx.isOwner && agentIds.length > 0,
  );
  const rowMeta = useMemo(() => {
    if (!ctx.isOwner) return undefined;
    // toolkitAgentIds only yields toolkits with >=1 agent, so a zero-agent app
    // never gets an entry and correctly falls back to its normal description.
    const byToolkit = toolkitAgentIds(grants.byAgent);
    const meta = new Map<string, string>();
    for (const [toolkit, ids] of byToolkit) {
      meta.set(
        toolkit,
        t("integrations.orgAllowlist.usedByAgents", { count: ids.length }),
      );
    }
    return meta;
  }, [ctx.isOwner, grants.byAgent, t]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <AllowlistEditor
          universe={catalog.data ?? []}
          allowedToolkits={orgSettings.data?.allowedToolkits ?? null}
          seedToolkits={(connections.data ?? []).map((c) => c.toolkit)}
          saving={setOrgSettings.isPending}
          readOnly={readOnly}
          rowMeta={rowMeta}
          onSave={(next) => setOrgSettings.mutate(next)}
          copy={{
            question: t("integrations.orgAllowlist.question"),
            policyHelper: t("integrations.orgAllowlist.policyHelper"),
            anyLabel: t("integrations.orgAllowlist.anyLabel"),
            anyDesc: t("integrations.orgAllowlist.anyDesc"),
            pickedLabel: t("integrations.orgAllowlist.pickedLabel"),
            pickedDesc: t("integrations.orgAllowlist.pickedDesc"),
            allowedHeading: t("integrations.orgAllowlist.allowedHeading"),
            addHeading: t("integrations.orgAllowlist.addHeading"),
            allowedEmpty: t("integrations.orgAllowlist.allowedEmpty"),
            allowedEmptyCategory: t(
              "integrations.orgAllowlist.allowedEmptyCategory",
            ),
            allowApp: (name) =>
              t("integrations.orgAllowlist.allowApp", { name }),
            readOnlyNote: readOnly
              ? t("integrations.orgAllowlist.ownerOnly")
              : undefined,
          }}
        />
      )}
      <p className="mt-8 text-center text-xs text-ink-muted">
        {t("integrations.orgAllowlist.perAgentNote")}
      </p>
    </div>
  );
}
