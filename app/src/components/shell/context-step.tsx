import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isAgentContextId } from "../../lib/agent-role-catalog";
import { ChoiceStep } from "./choice-step";
import {
  CONTEXT_SEARCH_REACH,
  contextRunsForQuery,
} from "./context-step-model";
import type { AgentRoleState } from "./use-agent-role-state";

/**
 * Step 1 of the guided setup: the industry the agent works in. It comes first
 * because it decides which jobs the next step offers, and it is the question a
 * non-technical owner can answer without thinking ("I'm in freight").
 *
 * The chips are sorted by their translated label, so the run reads the same
 * way it would be scanned in every language, and the filter is the way through
 * them once the catalog outgrows one screen: typing anywhere lands in it, and
 * a query nothing matches becomes the answer itself.
 */
export function ContextStep({
  state,
  onAnswered,
}: {
  state: AgentRoleState;
  onAnswered: () => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  const runsForQuery = useCallback(
    (query: string) =>
      contextRunsForQuery(query, (id) => t(`roleSetup.contexts.${id}`)),
    [t],
  );
  const sections = useMemo(() => runsForQuery(""), [runsForQuery]);

  return (
    <ChoiceStep
      headline={t("roleSetup.contextHeadline")}
      keyboardHint={t("roleSetup.chipsKeyboardHint")}
      sections={sections}
      selectedId={state.contextId}
      custom={{ active: state.contextIsCustom, value: state.customContext }}
      customLabel={t("roleSetup.somethingElse")}
      customPlaceholder={t("roleSetup.contextPlaceholder")}
      continueLabel={t("roleSetup.continue")}
      cancelLabel={t("roleSetup.cancel")}
      search={{
        placeholder: t("roleSetup.contextSearch"),
        reach: CONTEXT_SEARCH_REACH,
        runsFor: runsForQuery,
        noMatchesLabel: t("roleSetup.noContextMatches"),
        queryAnswerLabel: (query) =>
          t("roleSetup.useQueryAsContext", { query }),
        onUseQuery: (query) => {
          // The words already typed into the filter ARE the answer: taking
          // them into the custom field saves typing them a second time.
          state.chooseCustomContext();
          state.writeCustomContext(query);
        },
      }}
      onSelect={(id) => {
        // The run renders catalog ids alone, so this only ever narrows.
        if (!isAgentContextId(id)) return;
        state.chooseContext(id);
        onAnswered();
      }}
      onSelectCustom={state.chooseCustomContext}
      onCancelCustom={state.cancelCustomContext}
      onCustomChange={state.writeCustomContext}
      onContinue={onAnswered}
    />
  );
}
