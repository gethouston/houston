/**
 * Slim strip under the tab bar while a just-created agent's engine is still
 * warming up (HOU-693) — tells the user why routines, skills, files, and
 * settings look idle instead of letting those tabs fail or hang mutely. The
 * activity tab is excluded by the caller: there the in-chat
 * `AgentProvisioningCard` carries the same message at send time.
 */

import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAgentProvisioningStore } from "../../stores/agent-provisioning";

export function AgentProvisioningBanner({ agentId }: { agentId: string }) {
  const { t } = useTranslation("shell");
  const active = useAgentProvisioningStore((s) =>
    Boolean(s.provisioning[agentId]),
  );
  if (!active) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-border/50 bg-secondary/60 px-4 py-2 text-[13px] text-foreground/70"
    >
      <Spinner className="size-3.5 shrink-0" />
      <span>{t("agentProvisioning.banner")}</span>
    </div>
  );
}
