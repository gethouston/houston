import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { delegationWithAccepts, delegationWithMode } from "@houston/sdk";
import type { AgentDelegation, AgentDelegationMode } from "@houston/wire-types";
import { useTranslation } from "react-i18next";
import {
  useAgentDelegation,
  useSetAgentDelegation,
} from "../../hooks/queries/use-agent-delegation";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { SettingsCard, SettingsControlRow } from "../settings/settings-row";
import { AgentDelegationPicker } from "./agent-delegation-picker";
import { AgentDelegationSkeleton } from "./agent-delegation-skeleton";

const outgoingModes: readonly AgentDelegationMode[] = ["all", "picked", "off"];

function isDelegationMode(value: string): value is AgentDelegationMode {
  return outgoingModes.some((mode) => mode === value);
}

export function AgentDelegationSection({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const loadedWorkspaceId = useAgentStore((state) => state.loadedWorkspaceId);
  const loadedAgents = useAgentStore((state) => state.agents);
  const roster = loadedWorkspaceId === workspaceId ? loadedAgents : [];
  const delegation = useAgentDelegation(agent.id, true);
  const setDelegation = useSetAgentDelegation(agent.id);
  const policy = delegation.data;
  const save = (change: (current: AgentDelegation) => AgentDelegation) =>
    setDelegation.mutate(change);

  if (delegation.isPending) return <AgentDelegationSkeleton />;
  if (delegation.isError || !policy) {
    return (
      <div role="alert">
        <p className="text-sm text-ink-muted">
          {t("delegation.loadError.title")}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => void delegation.refetch()}
        >
          {t("delegation.loadError.retry")}
        </Button>
      </div>
    );
  }

  return (
    <SettingsCard>
      <SettingsControlRow title={t("delegation.outgoing.label")} stack>
        <Select
          value={policy.mode}
          onValueChange={(value) => {
            if (isDelegationMode(value) && value !== policy.mode) {
              save((current) => delegationWithMode(current, value));
            }
          }}
        >
          <SelectTrigger
            aria-label={t("delegation.outgoing.aria", { name: agent.name })}
            className="min-h-11 w-full rounded-lg md:min-h-9 md:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("delegation.outgoing.everyone")}
            </SelectItem>
            <SelectItem value="picked">
              {t("delegation.outgoing.picked")}
            </SelectItem>
            <SelectItem value="off">{t("delegation.outgoing.none")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsControlRow>
      {policy.mode === "picked" && (
        <AgentDelegationPicker
          agent={agent}
          roster={roster}
          policy={policy}
          save={save}
        />
      )}
      <SettingsControlRow title={t("delegation.incoming.label")} stack>
        <Select
          value={policy.acceptsMissions ? "everyone" : "none"}
          onValueChange={(value) => {
            if (value === "everyone" || value === "none") {
              const accepts = value === "everyone";
              if (accepts !== policy.acceptsMissions) {
                save((current) => delegationWithAccepts(current, accepts));
              }
            }
          }}
        >
          <SelectTrigger
            aria-label={t("delegation.incoming.aria", { name: agent.name })}
            className="min-h-11 w-full rounded-lg md:min-h-9 md:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">
              {t("delegation.incoming.everyone")}
            </SelectItem>
            <SelectItem value="none">
              {t("delegation.incoming.none")}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingsControlRow>
    </SettingsCard>
  );
}
