import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type AgentRoleId, isAgentRoleId } from "../../lib/agent-role-catalog";
import {
  isLeadershipRoleId,
  type LeadershipRoleId,
} from "../../lib/leadership-roles";
import { ChoiceStep } from "./choice-step";
import type { RoleQuestionAnswer } from "./role-question";
import {
  ROLE_SEARCH_REACH,
  roleRunsForQuery,
  SELF_ROLE_SEARCH_REACH,
  selfRoleRunsForQuery,
} from "./role-step-model";
import type { AgentRoleState } from "./use-agent-role-state";

export interface LeadershipChoice {
  selectedId: LeadershipRoleId | null;
  onSelect: (id: LeadershipRoleId) => void;
}

type Audience =
  | { audience?: "agent"; leadership?: never }
  | { audience: "self"; leadership: LeadershipChoice };

export function RoleStep({
  state,
  audience = "agent",
  leadership,
  onAnswered,
}: Audience & {
  state: AgentRoleState;
  onAnswered: (answer: RoleQuestionAnswer<AgentRoleId>) => void;
}) {
  const { t } = useTranslation("agentOnboarding");
  const asksSelf = leadership !== undefined;
  const runsForQuery = useCallback(
    (query: string) => {
      const labels = {
        role: (id: AgentRoleId) => t(`roleSetup.roles.${id}`),
        more: t("roleSetup.moreRoles"),
        other: t("roleSetup.otherRoles"),
      };
      if (!asksSelf) return roleRunsForQuery(state.contextId, query, labels);
      return selfRoleRunsForQuery(state.contextId, query, {
        ...labels,
        leadershipRole: (id) => t(`roleSetup.leadershipRoles.${id}`),
        leadership: t("roleSetup.leadership"),
        context: state.contextId
          ? t(`roleSetup.contexts.${state.contextId}`)
          : "",
      });
    },
    [asksSelf, state.contextId, t],
  );
  const sections = useMemo(() => runsForQuery(""), [runsForQuery]);
  const heldPosition = state.roleIsCustom
    ? null
    : (leadership?.selectedId ?? null);

  return (
    <ChoiceStep
      headline={t(
        audience === "self"
          ? "roleSetup.selfRoleHeadline"
          : "roleSetup.roleHeadline",
      )}
      hint={
        state.contextId === null ? t("roleSetup.typeToFindAnyRole") : undefined
      }
      keyboardHint={t("roleSetup.chipsKeyboardHint")}
      sections={sections}
      selectedId={state.roleId ?? heldPosition}
      custom={{ active: state.roleIsCustom, value: state.customRole }}
      customLabel={t("roleSetup.somethingElse")}
      customPlaceholder={t("roleSetup.rolePlaceholder")}
      continueLabel={t("roleSetup.continue")}
      cancelLabel={t("roleSetup.cancel")}
      search={{
        placeholder: t("roleSetup.roleSearch"),
        reach: asksSelf ? SELF_ROLE_SEARCH_REACH : ROLE_SEARCH_REACH,
        runsFor: runsForQuery,
        noMatchesLabel: t("roleSetup.noRoleMatches"),
        queryAnswerLabel: (query) => t("roleSetup.useQueryAsRole", { query }),
        onUseQuery: (query) => {
          state.chooseCustomRole();
          state.writeCustomRole(query);
        },
      }}
      onSelect={(id) => {
        if (leadership && isLeadershipRoleId(id)) {
          state.clearRole();
          leadership.onSelect(id);
          return;
        }
        if (!isAgentRoleId(id)) return;
        state.chooseRole(id);
        onAnswered({ kind: "catalog", id });
      }}
      onSelectCustom={state.chooseCustomRole}
      onCancelCustom={state.cancelCustomRole}
      onCustomChange={state.writeCustomRole}
      onContinue={() => onAnswered({ kind: "custom", label: state.customRole })}
    />
  );
}
