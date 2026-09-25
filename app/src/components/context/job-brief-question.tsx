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

/**
 * One of the two questions, wired to the catalog it is answered from: the runs
 * to show, the words to show them in, and the way back from a stored answer to
 * the chip it was picked from.
 */
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
    /** The runs render catalog ids alone, so this only ever narrows. */
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

/**
 * The industry / role question, asked again about an answer already given:
 * from the Job description tab, and from an employee card's role and industry
 * lines. It is the SAME control the create flow asks it with
 * ({@link ChoiceStep}: a filter, a wrapping run of chips, and "Something else"
 * for an answer nobody listed), so there is one way of answering it.
 *
 * It opens on `current`: a catalog answer as its picked chip, words the person
 * typed as the typed field holding them, so a small fix is a small edit. It
 * reads `current` once, on mount; its frame mounts it only while open.
 * `onAnswer` gets the answer as the person reads it (a chip's label, or the
 * typed words); picking a chip answers outright, typed words on Continue.
 */
export function JobBriefQuestion({
  field,
  current,
  industryId,
  compact,
  onAnswer,
}: {
  field: JobBriefField;
  /** The answer given so far, as the person reads it. */
  current: string | null;
  /** The industry's catalog id, so the role runs lead with its own jobs. */
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
  // Words that match no chip are the person's own: the typed field opens
  // holding them, rather than making them start the answer over.
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
      // An industry the person typed has no jobs of its own, so say out loud
      // that the filter reaches the rest of the catalog.
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
        // The words already typed into the filter ARE the answer: taking
        // them into the typed field saves typing them a second time.
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
