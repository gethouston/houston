import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createAgentRoleContext } from "../../../lib/agent-role-context";
import type { JobBriefField } from "../../context/job-brief-model";
import { visibleNameIssue } from "../../employee-card/employee-name-validation";
import {
  useEmployeeNameIssueCopy,
  useEmployeeNameSuggester,
} from "../../employee-card/use-employee-name";
import {
  type BasicTeamDraft,
  type BasicTeamRoleId,
  type BasicTeamSubmit,
  basicTeamAnswered,
  basicTeamBrief,
  basicTeamColors,
  basicTeamDefaults,
  basicTeamNameIssues,
  basicTeamOffscreenFailures,
  basicTeamSiblingNames,
  basicTeamSubmit,
  hasBasicTeamWork,
} from "./basic-team-model";
import type { RosterMember } from "./team-roster-model";
import type { TeamRoster } from "./use-team-roster";

/** A starter as its card shows it: still a draft, or a member of the roster
 *  with its status. Either one can be renamed, rebriefed and recolored. */
export interface BasicTeamRow {
  roleId: BasicTeamRoleId;
  roleLabel: string;
  /** The industry the card shows: its own, or the team's. */
  industry: string;
  /** What the name field holds: a draft's typed name (blank until typed),
   *  or the member's name once it joined. */
  name: string;
  color: string;
  /** Null while a draft; the roster's member once it joined, edited from
   *  then on through the roster. */
  joined: RosterMember | null;
  /** The card's message for a draft's name, or null. */
  error: string | null;
}

export interface BasicTeam {
  rows: BasicTeamRow[];
  /** A draft is still to hire, a starter's create failed, or a save did. */
  hasWork: boolean;
  /** Hires made one by one whose create or save failed: off this screen,
   *  yet they hold the team back until tried again (or removed). */
  offscreenFailures: RosterMember[];
  /** A draft's name, brief and color; a joined starter is edited on the
   *  roster. */
  rename: (index: number, name: string) => void;
  answer: (index: number, field: JobBriefField, answer: string) => void;
  recolor: (index: number, color: string) => void;
  /** Puts the next suggested name for its job in a draft's field. */
  suggest: (index: number) => void;
  /** Hires every draft and retries every starter whose create failed, or,
   *  when a name holds them back, says which card to fix first. */
  submit: () => BasicTeamSubmit;
}

/**
 * The starter team: three badges the person names, briefs and colors in place,
 * hired together into `industry` (or the one a card was given) through the
 * card's roster, side by side with
 * anyone already hired one by one. Every name is required; a blank one is
 * flagged once the person presses "Hire my team".
 */
export function useBasicTeam({
  industry,
  roster,
}: {
  /** The industry as the person reads it: every member's brief context. */
  industry: string;
  roster: TeamRoster;
}): BasicTeam {
  const { t } = useTranslation("agentOnboarding");
  const issueCopy = useEmployeeNameIssueCopy();
  const suggestName = useEmployeeNameSuggester();
  const [attempted, setAttempted] = useState(false);
  const [held, setDrafts] = useState(() =>
    basicTeamDefaults((id) => t(`agentOnboarding:roleSetup.roles.${id}`)),
  );
  // A starter let go from the roster (its create failed) is a draft again,
  // with the name and color it had.
  const drafts = held.map((draft) =>
    draft.rosterKey !== null &&
    !roster.members.some((member) => member.key === draft.rosterKey)
      ? { ...draft, rosterKey: null }
      : draft,
  );

  const issues = basicTeamNameIssues(drafts, roster.takenNames);
  const colors = basicTeamColors(drafts, roster.nextColor);
  const rows = drafts.map((draft, index): BasicTeamRow => {
    const member = roster.members.find((m) => m.key === draft.rosterKey);
    const shown = visibleNameIssue(issues[index], attempted);
    return {
      roleId: draft.roleId,
      roleLabel: draft.roleLabel,
      industry: basicTeamBrief(draft, industry).context,
      name: member ? member.name : draft.name,
      color: member?.color ?? colors[index],
      joined: member ?? null,
      error: member ? null : issueCopy(shown, draft.name),
    };
  });
  const failed = rows.filter((row) => row.joined?.status.kind === "failed");
  // A save that failed is sent again by the finish this press requests.
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
      // Unreachable while the view holds an industry; narrowing, not a skip.
      if (!brief) return null;
      return roster.join({ name: row.name.trim(), color: row.color, brief });
    });
    // The color is pinned with the hire, so a starter let go comes back as
    // a draft in the color it had.
    setDrafts((current) =>
      current.map((draft, at) => ({
        ...draft,
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
    recolor: (index, color) => update(index, { color }),
    suggest: (index) =>
      update(index, {
        name: suggestName({
          role: drafts[index].roleLabel,
          current: drafts[index].name,
          taken: [
            ...roster.takenNames,
            ...basicTeamSiblingNames(drafts, index),
          ],
        }),
      }),
    submit: () => {
      const outcome = basicTeamSubmit(drafts, roster.takenNames, retries);
      if (outcome.kind === "invalid") setAttempted(true);
      if (outcome.kind === "hire") hireAll();
      return outcome;
    },
  };
}
