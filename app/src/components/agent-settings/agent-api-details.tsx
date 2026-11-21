import { apiSetupPrompt, apiStartMissionRequest } from "@houston/sdk";
import { Button, cn } from "@houston-ai/core";
import { Bot, Building2, Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { CodeExample } from "../settings/code-example";
import { CopyIdRow } from "../settings/copy-id-row";
import { useOrgSlug } from "../settings/sections/api-org-id";
import { SettingsCard } from "../settings/settings-row";

export function AgentApiDetails({
  agent,
  compact = false,
  children,
}: {
  agent: Pick<Agent, "id" | "name">;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation("settings");
  const { slug, failed } = useOrgSlug();
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
  const baseUrl = window.__HOUSTON_ENGINE__?.baseUrl ?? null;
  const prompt =
    baseUrl && slug
      ? apiSetupPrompt({
          baseUrl,
          agentId: agent.id,
          agentName: agent.name,
          orgId: slug,
        })
      : null;

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      addToast({ title: t("apiKeys.agentAccess.promptCopied") });
    } catch (err) {
      addToast({
        title: t("apiKeys.agentAccess.promptCopyFailed"),
        description: genericErrorDescription("copy_api_prompt", err),
        variant: "error",
      });
    }
  }

  const body = (
    <>
      <Button
        className={compact ? "self-start" : undefined}
        disabled={!prompt}
        onClick={() => void copyPrompt()}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {t("apiKeys.agentAccess.copyPrompt")}
      </Button>
      <p className={cn("text-xs text-ink-muted", !compact && "mt-2 mb-6")}>
        {t("apiKeys.agentAccess.promptHint")}
      </p>
      <SettingsCard>
        <CopyIdRow
          icon={Bot}
          label={t("apiKeys.agentAccess.agentId")}
          value={agent.id}
          copyFailedTitle={t("apiKeys.agentAccess.agentIdCopyFailed")}
          reportKey="copy_agent_id"
        />
        {!failed && (
          <CopyIdRow
            icon={Building2}
            label={t("apiKeys.orgId.title")}
            value={slug}
            copyFailedTitle={t("apiKeys.orgId.copyFailed")}
            reportKey="copy_org_id"
          />
        )}
        {children}
      </SettingsCard>
      {baseUrl && slug && (
        <div className={compact ? undefined : "mt-6"}>
          <CodeExample
            title={t("apiKeys.example.missionTitle")}
            hint={t("apiKeys.example.missionHint", { name: agent.name })}
            code={apiStartMissionRequest({
              baseUrl,
              agentId: agent.id,
              orgId: slug,
            })}
          />
        </div>
      )}
    </>
  );
  return compact ? body : <div>{body}</div>;
}
