import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AGENT_CONTEXT_IDS,
  AGENT_ROLE_IDS,
  type AgentContextId,
  type AgentRoleId,
  isAgentContextId,
  isAgentRoleId,
} from "../../lib/agent-role-catalog";
import { ChoiceStep } from "../shell/choice-step";
import {
  CONTEXT_SEARCH_REACH,
  contextRunsForQuery,
} from "../shell/context-step-model";
import { ROLE_SEARCH_REACH, roleRunsForQuery } from "../shell/role-step-model";
import {
  type JobBriefField,
  jobAnswerEntry,
  typedJobAnswer,
} from "./job-brief-model";

function useJobBriefCatalog(
  field: JobBriefField,
  industryId: AgentContextId | null,
) {
  const { t } = useTranslation("agentOnboarding");
  const industry = field === "industry";
  const contextLabel = useCallback(
    (id: AgentContextId) => t(`roleSetup.contexts.${id}`),
    [t],
  );
  const roleLabel = useCallback(
    (id: AgentRoleId) => t(`roleSetup.roles.${id}`),
    [t],
  );

  const runsFor = useCallback(
    (query: string) =>
      industry
        ? contextRunsForQuery(query, contextLabel)
        : roleRunsForQuery(industryId, query, {
            role: roleLabel,
            more: t("roleSetup.moreRoles"),
            other: t("roleSetup.otherRoles"),
          }),
    [industry, industryId, contextLabel, roleLabel, t],
  );

  return {
    t,
    industry,
    runsFor,
    labelFor: (id: string): string | null => {
      if (industry) return isAgentContextId(id) ? contextLabel(id) : null;
      return isAgentRoleId(id) ? roleLabel(id) : null;
    },
    entryFor: (current: string | null) =>
      industry
        ? jobAnswerEntry(AGENT_CONTEXT_IDS, contextLabel, current)
        : jobAnswerEntry(AGENT_ROLE_IDS, roleLabel, current),
  };
}

export function JobBriefQuestion({
  field,
  current,
  industryId,
  compact,
  onAnswer,
}: {
  field: JobBriefField;
  current: string | null;
  industryId: AgentContextId | null;
  compact?: boolean;
  onAnswer: (answer: string) => void;
}) {
  const { t, industry, runsFor, labelFor, entryFor } = useJobBriefCatalog(
    field,
    industryId,
  );
  const sections = useMemo(() => runsFor(""), [runsFor]);
  const opening = entryFor(current);
  const [custom, setCustom] = useState({
    active: opening.typed !== "",
    value: opening.typed,
  });
  const key = <C extends string, R extends string>(context: C, role: R) =>
    industry ? context : role;

  return (
    <ChoiceStep
      compact={compact}
      headline={t(key("roleSetup.contextHeadline", "roleSetup.roleHeadline"))}
      hint={
        industry || industryId ? undefined : t("roleSetup.typeToFindAnyRole")
      }
      keyboardHint={t("roleSetup.chipsKeyboardHint")}
      sections={sections}
      selectedId={opening.id}
      custom={custom}
      customLabel={t("roleSetup.somethingElse")}
      customPlaceholder={t(
        key("roleSetup.contextPlaceholder", "roleSetup.rolePlaceholder"),
      )}
      continueLabel={t("roleSetup.continue")}
      cancelLabel={t("roleSetup.cancel")}
      search={{
        placeholder: t(key("roleSetup.contextSearch", "roleSetup.roleSearch")),
        reach: industry ? CONTEXT_SEARCH_REACH : ROLE_SEARCH_REACH,
        runsFor,
        noMatchesLabel: t(
          key("roleSetup.noContextMatches", "roleSetup.noRoleMatches"),
        ),
        queryAnswerLabel: (query) =>
          t(key("roleSetup.useQueryAsContext", "roleSetup.useQueryAsRole"), {
            query,
          }),
        onUseQuery: (query) => setCustom(typedJobAnswer(query)),
      }}
      onSelect={(id) => {
        const label = labelFor(id);
        if (label) onAnswer(label);
      }}
      onSelectCustom={() => setCustom((c) => ({ ...c, active: true }))}
      onCancelCustom={() => setCustom({ active: false, value: "" })}
      onCustomChange={(value) => setCustom(typedJobAnswer(value))}
      onContinue={() => {
        if (custom.value.trim()) onAnswer(custom.value);
      }}
    />
  );
}
