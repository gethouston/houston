import { HoustonAvatar, resolveAgentColor, Switch } from "@houston-ai/core";
import { delegationWithAgent, otherAddressableAgents } from "@houston/sdk";
import type { AgentDelegation } from "@houston/wire-types";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";

function PickerRow({
  agent,
  other,
  policy,
  save,
}: {
  agent: Agent;
  other: Agent;
  policy: AgentDelegation;
  save: (change: (current: AgentDelegation) => AgentDelegation) => void;
}) {
  const { t } = useTranslation("teams");
  const id = useId();
  const checked = policy.agents.includes(other.id);
  return (
    <label
      htmlFor={id}
      className="flex min-h-14 cursor-pointer items-center gap-3 py-3 pr-4 pl-4 hover:bg-hover focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus"
    >
      <HoustonAvatar color={resolveAgentColor(other.color)} diameter={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {other.name}
        </span>
      </span>
      <Switch
        id={id}
        aria-label={t("delegation.picker.rowAria", {
          name: agent.name,
          other: other.name,
        })}
        checked={checked}
        onCheckedChange={(next) =>
          save((current) => delegationWithAgent(current, other.id, next))
        }
      />
    </label>
  );
}

export function AgentDelegationPicker({
  agent,
  roster,
  policy,
  save,
}: {
  agent: Agent;
  roster: readonly Agent[];
  policy: AgentDelegation;
  save: (change: (current: AgentDelegation) => AgentDelegation) => void;
}) {
  const { t } = useTranslation("teams");
  const others = otherAddressableAgents(roster, agent.id);
  return (
    <div className="divide-y divide-line">
      {others.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-muted">
          {t("delegation.picker.empty")}
        </p>
      ) : (
        others.map((other) => (
          <PickerRow
            key={other.id}
            agent={agent}
            other={other}
            policy={policy}
            save={save}
          />
        ))
      )}
    </div>
  );
}
