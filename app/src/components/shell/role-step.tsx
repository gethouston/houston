import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { isAgentRoleId } from "../../lib/agent-role-catalog";
import { ChoiceStep } from "./choice-step";
import { ROLE_SEARCH_REACH, roleRunsForQuery } from "./role-step-model";
import type { AgentRoleState } from "./use-agent-role-state";

/**
 * Step 2 of the guided setup: the job the agent takes over. The picked
 * context's own jobs lead, because they are the ones that made the user answer
 * the first question; the roles every industry shares follow under their
 * own heading. A context the user typed themselves has only the shared run.
 *
 * Searching reaches the whole catalog, so a job the user can name is found
 * wherever it was filed (`role-step-model.ts`).
 */
export function RoleStep({
  state,
  onAnswered,
}: {
  state: AgentRoleState;
  onAnswered: () => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  const runsForQuery = useCallback(
    (query: string) =>
      roleRunsForQuery(state.contextId, query, {
        role: (id) => t(`roleSetup.roles.${id}`),
        more: t("roleSetup.moreRoles"),
        other: t("roleSetup.otherRoles"),
      }),
    [state.contextId, t],
  );
  const sections = useMemo(() => runsForQuery(""), [runsForQuery]);

  return (
    <ChoiceStep
      headline={t("roleSetup.roleHeadline")}
      // An industry the user typed has no jobs of its own, so the ten shared ones
      // are the whole run: say out loud that the filter reaches the rest,
      // or a short run reads as the entire offer.
      hint={
        state.contextId === null ? t("roleSetup.typeToFindAnyRole") : undefined
      }
      keyboardHint={t("roleSetup.chipsKeyboardHint")}
      sections={sections}
      selectedId={state.roleId}
      custom={{ active: state.roleIsCustom, value: state.customRole }}
      customLabel={t("roleSetup.somethingElse")}
      customPlaceholder={t("roleSetup.rolePlaceholder")}
      continueLabel={t("roleSetup.continue")}
      cancelLabel={t("roleSetup.cancel")}
      search={{
        placeholder: t("roleSetup.roleSearch"),
        reach: ROLE_SEARCH_REACH,
        runsFor: runsForQuery,
        noMatchesLabel: t("roleSetup.noRoleMatches"),
        queryAnswerLabel: (query) => t("roleSetup.useQueryAsRole", { query }),
        onUseQuery: (query) => {
          // The words already typed into the filter ARE the answer: taking
          // them into the custom field saves typing them a second time.
          state.chooseCustomRole();
          state.writeCustomRole(query);
        },
      }}
      onSelect={(id) => {
        // The runs render catalog ids alone, so this only ever narrows.
        if (!isAgentRoleId(id)) return;
        state.chooseRole(id);
        onAnswered();
      }}
      onSelectCustom={state.chooseCustomRole}
      onCancelCustom={state.cancelCustomRole}
      onCustomChange={state.writeCustomRole}
      onContinue={onAnswered}
    />
  );
}
