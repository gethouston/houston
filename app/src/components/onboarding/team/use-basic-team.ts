import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentContextId,
  AgentRoleId,
} from "../../../lib/agent-role-catalog";
import { createAgentRoleContext } from "../../../lib/agent-role-context";
import type { JobBriefField } from "../../context/job-brief-model";
import { visibleNameIssue } from "../../employee-card/employee-name-validation";
import { useEmployeeNameIssueCopy } from "../../employee-card/use-employee-name";
import {
  basicTeamAdd,
  basicTeamRecolor,
  basicTeamRemovable,
  basicTeamRemove,
} from "./basic-team-edit";
import {
  type BasicTeamDraft,
  type BasicTeamSubmit,
  basicTeamAnswered,
  basicTeamBrief,
  basicTeamColors,
  basicTeamDefaults,
  basicTeamOffscreenFailures,
  basicTeamSubmit,
  hasBasicTeamWork,
} from "./basic-team-model";
import { basicTeamNameIssues, basicTeamNames } from "./basic-team-names";
import type { RosterMember } from "./team-roster-model";
import type { TeamRoster } from "./use-team-roster";

export interface BasicTeamRow {
  key: string;
  roleId: AgentRoleId;
  roleLabel: string;
  industry: string;
  name: string;
  color: string;
  joined: RosterMember | null;
  error: string | null;
  removable: boolean;
}

export interface BasicTeam {
  rows: BasicTeamRow[];
  hasWork: boolean;
  offscreenFailures: RosterMember[];
  rename: (index: number, name: string) => void;
  answer: (index: number, field: JobBriefField, answer: string) => void;
  recolor: (index: number, color: string) => void;
  add: () => void;
  remove: (index: number) => void;
  submit: () => BasicTeamSubmit;
}

export function useBasicTeam({
  industry,
  contextId,
  roster,
}: {
  industry: string;
  contextId: AgentContextId | null;
  roster: TeamRoster;
}): BasicTeam {
  const { t } = useTranslation("agentOnboarding");
  const issueCopy = useEmployeeNameIssueCopy();
  const [attempted, setAttempted] = useState(false);
  const roleLabel = useCallback(
    (id: AgentRoleId) => t(`agentOnboarding:roleSetup.roles.${id}`),
    [t],
  );
  const [held, setDrafts] = useState(() =>
    basicTeamDefaults(roleLabel, contextId),
  );
  useEffect(() => {
    setDrafts(basicTeamDefaults(roleLabel, contextId));
  }, [contextId, roleLabel]);
  const settle = (list: readonly BasicTeamDraft[]) =>
    list.map((draft) =>
      draft.rosterKey !== null &&
      !roster.members.some((member) => member.key === draft.rosterKey)
        ? { ...draft, rosterKey: null }
        : draft,
    );
  const drafts = settle(held);

  const names = basicTeamNames(drafts, roster.takenNames);
  const issues = basicTeamNameIssues(drafts, roster.takenNames);
  const colors = basicTeamColors(drafts, roster.nextColor);
  const rows = drafts.map((draft, index): BasicTeamRow => {
    const member = roster.members.find((m) => m.key === draft.rosterKey);
    const shown = visibleNameIssue(issues[index], attempted);
    return {
      key: draft.key,
      roleId: draft.roleId,
      roleLabel: draft.roleLabel,
      industry: basicTeamBrief(draft, industry).context,
      name: member ? member.name : names[index],
      color: member?.color ?? colors[index],
      joined: member ?? null,
      error: member ? null : issueCopy(shown, names[index]),
      removable: basicTeamRemovable(drafts, index),
    };
  });
  const failed = rows.filter((row) => row.joined?.status.kind === "failed");
  const retries =
    failed.length + roster.members.filter((m) => m.saveFailed).length;

  const update = (index: number, change: Partial<BasicTeamDraft>) =>
    setDrafts((current) =>
      current.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );

  const hireAll = () => {
    for (const row of failed) if (row.joined) roster.retry(row.joined.key);
    const keys = rows.map((row) => {
      if (row.joined) return row.joined.key;
      const brief = createAgentRoleContext({
        context: row.industry,
        role: row.roleLabel,
      });
      if (!brief) return null;
      return roster.join({ name: row.name.trim(), color: row.color, brief });
    });
    setDrafts((current) =>
      current.map((draft, at) => ({
        ...draft,
        name: rows[at].name,
        color: rows[at].color,
        rosterKey: keys[at],
      })),
    );
  };

  return {
    rows,
    hasWork: hasBasicTeamWork(drafts, retries),
    offscreenFailures: basicTeamOffscreenFailures(drafts, roster.members),
    rename: (index, name) => update(index, { name }),
    answer: (index, field, answer) =>
      setDrafts((current) =>
        basicTeamAnswered(current, index, industry, field, answer),
      ),
    recolor: (index, color) => {
      const shownColors = rows.map((row) => row.color);
      const changed = basicTeamRecolor(drafts, index, color, shownColors);
      setDrafts(changed);
      for (const [at, row] of rows.entries()) {
        if (row.joined && changed[at].color !== row.color)
          roster.edit(row.joined.key, {
            color: changed[at].color ?? undefined,
          });
      }
    },
    add: () =>
      setDrafts((current) =>
        basicTeamAdd(current, roleLabel, colors, roster.nextColor),
      ),
    remove: (index) =>
      setDrafts((current) => basicTeamRemove(settle(current), index, colors)),
    submit: () => {
      const outcome = basicTeamSubmit(drafts, roster.takenNames, retries);
      if (outcome.kind === "invalid") setAttempted(true);
      if (outcome.kind === "hire") hireAll();
      return outcome;
    },
  };
}
