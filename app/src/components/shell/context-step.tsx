import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  type AgentContextId,
  isAgentContextId,
} from "../../lib/agent-role-catalog";
import { ChoiceStep } from "./choice-step";
import {
  CONTEXT_SEARCH_REACH,
  contextRunsForQuery,
} from "./context-step-model";
import type { RoleQuestionAnswer, RoleQuestionAudience } from "./role-question";
import type { AgentRoleState } from "./use-agent-role-state";

export function ContextStep({
  state,
  audience = "agent",
  onAnswered,
}: {
  state: AgentRoleState;
  audience?: RoleQuestionAudience;
  onAnswered: (answer: RoleQuestionAnswer<AgentContextId>) => void;
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
      headline={t(
        audience === "self"
          ? "roleSetup.selfContextHeadline"
          : "roleSetup.contextHeadline",
      )}
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
          state.chooseCustomContext();
          state.writeCustomContext(query);
        },
      }}
      onSelect={(id) => {
        if (!isAgentContextId(id)) return;
        state.chooseContext(id);
        onAnswered({ kind: "catalog", id });
      }}
      onSelectCustom={state.chooseCustomContext}
      onCancelCustom={state.cancelCustomContext}
      onCustomChange={state.writeCustomContext}
      onContinue={() =>
        onAnswered({ kind: "custom", label: state.customContext })
      }
    />
  );
}
