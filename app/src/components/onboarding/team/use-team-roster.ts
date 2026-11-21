import { useRef, useState } from "react";
import type { AgentRoleContext } from "../../../lib/agent-role-context";
import { logAndReportError } from "../../../lib/error-report";
import {
  type RosterPatch,
  rosterEdit,
  rosterRetrySaves,
} from "./team-roster-edit";
import {
  type RosterMember,
  type RosterSettlement,
  rosterJoin,
  rosterRemove,
  rosterRetry,
  rosterSettle,
} from "./team-roster-model";
import { saveRosterMember } from "./team-roster-save";
import type { TeamHiring } from "./use-team-hiring";

export interface TeamRoster {
  members: RosterMember[];
  takenNames: string[];
  nextColor: (alsoTaken?: readonly string[]) => string;
  join: (entry: {
    name: string;
    color: string | undefined;
    brief: AgentRoleContext;
  }) => string;
  retry: (key: string) => void;
  remove: (key: string) => void;
  edit: (key: string, patch: RosterPatch) => void;
  retrySaves: () => void;
}

export function useTeamRoster(hiring: TeamHiring): TeamRoster {
  const [members, setMembers] = useState<RosterMember[]>([]);
  const current = useRef<RosterMember[]>([]);
  const nextKey = useRef(0);
  const saving = useRef(new Map<string, Promise<void>>());
  const commit = (next: RosterMember[]) => {
    current.current = next;
    setMembers(next);
  };

  const takenNames = [
    ...hiring.takenNames,
    ...members.map((member) => member.name),
  ];
  const onTheirWay = members.flatMap((member) =>
    member.status.kind === "joining" && member.color ? [member.color] : [],
  );

  const save = (key: string) => {
    const queued = (saving.current.get(key) ?? Promise.resolve())
      .then(() =>
        saveRosterMember(key, hiring, {
          read: () => current.current,
          write: commit,
        }),
      )
      .catch((err: unknown) => logAndReportError("team_card_roster_save", err));
    saving.current.set(key, queued);
  };

  const create = (member: RosterMember) => {
    const settle = (settlement: RosterSettlement) => {
      commit(rosterSettle(current.current, member.key, settlement));
      if (settlement.kind === "hired") save(member.key);
    };
    hiring
      .hire({ name: member.name, color: member.color, brief: member.brief })
      .then(settle)
      .catch((err: unknown) => {
        logAndReportError("team_card_roster_hire", err);
        settle({ kind: "failed", reason: "failed" });
      });
  };

  return {
    members,
    takenNames,
    nextColor: (alsoTaken = []) =>
      hiring.nextColor([...onTheirWay, ...alsoTaken]),
    join: (entry) => {
      nextKey.current += 1;
      const key = `hire-${nextKey.current}`;
      const next = rosterJoin(current.current, { ...entry, key });
      commit(next);
      create(next[next.length - 1]);
      return key;
    },
    retry: (key) => {
      const next = rosterRetry(current.current, key, hiring.takenNames);
      if (!next) return;
      commit(next.members);
      create(next.retried);
    },
    remove: (key) => commit(rosterRemove(current.current, key)),
    edit: (key, patch) => {
      commit(rosterEdit(current.current, key, patch));
      save(key);
    },
    retrySaves: () => {
      const retried = rosterRetrySaves(current.current);
      if (retried.keys.length === 0) return;
      commit(retried.members);
      for (const key of retried.keys) save(key);
    },
  };
}
