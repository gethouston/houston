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
  /** Names a new hire cannot take: the workspace's, plus every hire still
   *  on its way, which the workspace does not list until it lands. */
  takenNames: string[];
  /** The next free color, counting the colors of hires still on their way. */
  nextColor: (alsoTaken?: readonly string[]) => string;
  /** Adds a hire to the roster at once and creates it behind the person;
   *  returns its roster key. */
  join: (entry: {
    name: string;
    color: string | undefined;
    brief: AgentRoleContext;
  }) => string;
  retry: (key: string) => void;
  remove: (key: string) => void;
  /** Renames, recolors or rebriefs a member. Shown at once; saved through
   *  the host once the member exists (`team-roster-edit.ts`). */
  edit: (key: string, patch: RosterPatch) => void;
  /** Saves again every edit whose save failed (a pressed Done). */
  retrySaves: () => void;
}

/**
 * The card's roster: every hire of this run, on either path, created in the
 * background so pressing Hire never waits on the host. Nothing here blocks;
 * the only wait is Done's, for creates and edits still saving
 * (`useTeamFinish`).
 */
export function useTeamRoster(hiring: TeamHiring): TeamRoster {
  const [members, setMembers] = useState<RosterMember[]>([]);
  // The roster of record. Every change reads and writes it synchronously, so
  // several changes in one press (the basic team's joins and retries) and a
  // create settling between renders never work from a stale copy.
  const current = useRef<RosterMember[]>([]);
  const nextKey = useRef(0);
  // One save at a time per member: a rename moves the id, so the next save
  // must start from where the previous one landed.
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
      // `saveRosterMember` settles every failure itself; anything reaching
      // here is a bug, and the chain must survive it for the next save.
      .catch((err: unknown) => logAndReportError("team_card_roster_save", err));
    saving.current.set(key, queued);
  };

  const create = (member: RosterMember) => {
    const settle = (settlement: RosterSettlement) => {
      commit(rosterSettle(current.current, member.key, settlement));
      // An edit made while the member was joining is saved now it exists.
      if (settlement.kind === "hired") save(member.key);
    };
    hiring
      .hire({ name: member.name, color: member.color, brief: member.brief })
      .then(settle)
      .catch((err: unknown) => {
        // `hire` settles every create itself; anything reaching here is a bug.
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
