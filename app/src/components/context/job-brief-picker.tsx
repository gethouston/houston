import { FlowSheet } from "@houston-ai/core";
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
  choiceIdForLabel,
  type JobBriefField,
  typedJobAnswer,
} from "./job-brief-model";

/**
 * One of the two questions, wired to the catalog it is answered from: the runs
 * to show, the words to show them in, and the way back from a stored answer to
 * the chip it was picked from. Split out so the dialog below stays the shape
 * of the interaction rather than a fork in every prop.
 */
function useJobBriefQuestion(
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
    pickedId: (current: string | null): string | null =>
      industry
        ? choiceIdForLabel(AGENT_CONTEXT_IDS, contextLabel, current)
        : choiceIdForLabel(AGENT_ROLE_IDS, roleLabel, current),
  };
}

/**
 * The industry / role question, asked again after creation.
 *
 * It is the SAME control the create dialog asks it with ({@link ChoiceStep}:
 * a filter, a wrapping run of chips, and "Something else" for an answer nobody
 * listed) — a user who answered this once should not meet a second, different
 * way of answering it. Picking a chip answers outright and closes; typed words
 * are confirmed with Continue, since nothing can know a typed answer is
 * finished.
 *
 * The question opens on the answer already in the file: a catalog answer as
 * its picked chip, an answer the user typed as the typed field carrying their
 * own words, so a small fix is a small edit rather than a retype. Mounted only
 * while open (the rows own that), so it always opens on what the file holds
 * now — including a change the agent itself just made.
 */
export function JobBriefPicker({
  field,
  current,
  industryId,
  onClose,
  onPick,
}: {
  field: JobBriefField;
  /** The answer in the file, as the user reads it. */
  current: string | null;
  /** The saved industry's catalog id, so the role runs lead with its own jobs. */
  industryId: AgentContextId | null;
  onClose: () => void;
  onPick: (answer: string) => void;
}) {
  const { t, industry, runsFor, labelFor, pickedId } = useJobBriefQuestion(
    field,
    industryId,
  );
  const { t: tCommon } = useTranslation("common");
  const sections = useMemo(() => runsFor(""), [runsFor]);
  const picked = pickedId(current);
  // Words that match no chip are the user's own: the typed field opens holding
  // them, rather than making them start the answer over.
  const typed = current && !picked ? current : "";
  const [custom, setCustom] = useState({ active: !!typed, value: typed });

  const answer = (value: string) => {
    onPick(value);
    onClose();
  };
  const headline = t(
    industry ? "roleSetup.contextHeadline" : "roleSetup.roleHeadline",
  );

  return (
    <FlowSheet
      open
      onOpenChange={(next) => !next && onClose()}
      // A catalog of a hundred and eighty chips is scanning work, so it takes
      // the wide frame — the same one the create sheet asks this question in.
      size="wide"
      // The frame is NAMED for the answer being changed, and nothing draws
      // that name: the question itself is the step's own heading, exactly as
      // it reads inside the create sheet.
      title={t(industry ? "roleSetup.steps.context" : "roleSetup.steps.role")}
      labels={{ close: tCommon("actions.close") }}
    >
      <ChoiceStep
        headline={headline}
        // An industry the user typed has no jobs of its own, so say out loud
        // that the filter reaches the rest of the catalog.
        hint={
          industry || industryId ? undefined : t("roleSetup.typeToFindAnyRole")
        }
        keyboardHint={t("roleSetup.chipsKeyboardHint")}
        sections={sections}
        selectedId={picked}
        custom={custom}
        customLabel={t("roleSetup.somethingElse")}
        customPlaceholder={t(
          industry
            ? "roleSetup.contextPlaceholder"
            : "roleSetup.rolePlaceholder",
        )}
        continueLabel={t("roleSetup.continue")}
        cancelLabel={t("roleSetup.cancel")}
        search={{
          placeholder: t(
            industry ? "roleSetup.contextSearch" : "roleSetup.roleSearch",
          ),
          reach: industry ? CONTEXT_SEARCH_REACH : ROLE_SEARCH_REACH,
          runsFor,
          noMatchesLabel: t(
            industry ? "roleSetup.noContextMatches" : "roleSetup.noRoleMatches",
          ),
          queryAnswerLabel: (query) =>
            t(
              industry
                ? "roleSetup.useQueryAsContext"
                : "roleSetup.useQueryAsRole",
              { query },
            ),
          // The words already typed into the filter ARE the answer: taking
          // them into the typed field saves typing them a second time.
          onUseQuery: (query) => setCustom(typedJobAnswer(query)),
        }}
        onSelect={(id) => {
          const label = labelFor(id);
          if (label) answer(label);
        }}
        onSelectCustom={() => setCustom((c) => ({ ...c, active: true }))}
        onCancelCustom={() => setCustom({ active: false, value: "" })}
        onCustomChange={(value) => setCustom(typedJobAnswer(value))}
        onContinue={() => {
          if (custom.value.trim()) answer(custom.value);
        }}
      />
    </FlowSheet>
  );
}
