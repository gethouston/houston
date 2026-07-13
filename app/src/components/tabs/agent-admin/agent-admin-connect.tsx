import { Button } from "@houston-ai/core";
import { Bot, KeyRound, Network, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiKeys } from "../../../hooks/queries/use-api-keys";
import { useOrgs } from "../../../hooks/queries/use-spaces";
import {
  connectEndpoints,
  connectOrgSlug,
  DEVELOPER_DOCS,
} from "../../../lib/agent-connect-model";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { ApiKeyCreateDialog } from "../../settings/sections/api-key-create-dialog";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";
import { ConnectCard } from "./connect-card";

/**
 * "Use from other apps" section (C10 public API): shows a non-technical owner
 * that this agent can take work from outside Houston, and hands them the three
 * public addresses (MCP for AI assistants, A2A for other agents, missions REST
 * for automations) plus the API-key step every connection needs. Reached only
 * on a gateway that advertises `capabilities.apiKeys` (the nav row is gated),
 * where the agent's client-side id IS its stable public slug.
 */
export function AgentAdminConnect({ agent }: AgentAdminScreenProps) {
  const { t } = useTranslation("connect");
  const workspace = useWorkspaceStore((s) => s.current);
  // The section only renders on an apiKeys-capable gateway, so the orgs list
  // (which carries the personal space's slug for the A2A address) can load.
  const { data: orgs } = useOrgs(true);
  const origin = window.__HOUSTON_ENGINE__?.baseUrl ?? null;
  const endpoints = origin
    ? connectEndpoints(origin, agent.id, connectOrgSlug(workspace?.id, orgs))
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-8 py-10">
      <h2 className="text-lg font-semibold text-ink">{t("section.title")}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {t("section.intro", { name: agent.name })}
      </p>

      <KeyGate />

      <div className="mt-6 space-y-4">
        <ConnectCard
          icon={Bot}
          title={t("cards.assistant.title")}
          description={t("cards.assistant.description", { name: agent.name })}
          addressLabel={t("cards.assistant.addressLabel")}
          address={endpoints?.mcp ?? null}
          docsUrl={DEVELOPER_DOCS.mcp}
        />
        <ConnectCard
          icon={Network}
          title={t("cards.agents.title")}
          description={t("cards.agents.description", { name: agent.name })}
          addressLabel={t("cards.agents.addressLabel")}
          address={endpoints?.a2aCard ?? null}
          docsUrl={DEVELOPER_DOCS.a2a}
        />
        <ConnectCard
          icon={Zap}
          title={t("cards.automation.title")}
          description={t("cards.automation.description", { name: agent.name })}
          addressLabel={t("cards.automation.addressLabel")}
          address={endpoints?.missions ?? null}
          docsUrl={DEVELOPER_DOCS.missions}
        />
      </div>
    </div>
  );
}

/**
 * The API-key step: every external connection authenticates with a personal
 * key. Create one right here (the settings dialog, reused, reveals it once);
 * the full list lives in Settings > API keys, one deep-link away.
 */
function KeyGate() {
  const { t } = useTranslation("connect");
  const { data: keys } = useApiKeys();
  const [createOpen, setCreateOpen] = useState(false);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);

  const count = keys?.length ?? 0;

  return (
    <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3">
      <KeyRound className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{t("key.title")}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{t("key.description")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={count === 0 ? "default" : "outline"}
            onClick={() => setCreateOpen(true)}
          >
            {t("key.create")}
          </Button>
          {count > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSettingsSection("apiKeys");
                setViewMode("settings");
              }}
            >
              {t("key.manage", { count })}
            </Button>
          )}
        </div>
      </div>
      <ApiKeyCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
