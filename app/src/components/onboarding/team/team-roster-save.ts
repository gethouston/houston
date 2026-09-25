// `.ts` extensions so the node test runner can load this module on its own.
import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import {
  type RosterPatch,
  rosterRevert,
  rosterSaved,
  rosterSaveMark,
  rosterUnsaved,
} from "./team-roster-edit.ts";
import type { RosterMember } from "./team-roster-model.ts";

/** The host calls a roster save makes (`useTeamHiring`). Each call rejects
 *  on a failure it has already surfaced and reported. */
export interface RosterSaveHost {
  /** Resolves once the employee takes writes: a hosted one warms up after
   *  its create, and a write before then is refused. */
  whenReady: (id: string) => Promise<void>;
  /** Where the rename landed (the id follows the name), or null when it was
   *  refused and already explained. */
  rename: (id: string, name: string) => Promise<{ id: string } | null>;
  recolor: (id: string, color: string) => Promise<void>;
  /** Writes the new brief into the employee's job description, over the
   *  block its create wrote. */
  rebrief: (id: string, brief: AgentRoleContext) => Promise<void>;
}

/** The roster of record, read and written synchronously. */
export interface RosterRecord {
  read: () => readonly RosterMember[];
  write: (next: RosterMember[]) => void;
}

/**
 * Saves what a hired member shows that the host does not hold yet, one field
 * at a time, once the employee takes writes. Each field that lands is
 * committed at once (a rename moves the id, which every later write needs).
 * A rename the host refused goes back (the refusal is final and already
 * explained); a call that failed leaves the member marked unsaved with its
 * edit in place, for Done to try again. Never rejects.
 */
export async function saveRosterMember(
  key: string,
  host: RosterSaveHost,
  record: RosterRecord,
): Promise<void> {
  const waiting = hiredMember(record, key);
  if (!waiting) return;
  try {
    await host.whenReady(waiting.id);
  } catch {
    record.write(rosterSaveMark(record.read(), key, true));
    return;
  }
  // Read after the wait: the person may have edited again meanwhile.
  const member = hiredMember(record, key);
  if (!member) return;
  // A failure of an earlier save no longer stands once this one runs.
  if (member.member.saveFailed) {
    record.write(rosterSaveMark(record.read(), key, false));
  }
  const patch = rosterUnsaved(member.member);
  if (!patch) return;

  let id = member.id;
  const landed = (sent: RosterPatch) =>
    record.write(
      rosterSaved(record.read(), key, sent, { id, name: sent.name }),
    );
  const refused = (sent: RosterPatch) =>
    record.write(rosterRevert(record.read(), key, sent));

  const step = async (sent: RosterPatch, write: () => Promise<boolean>) => {
    try {
      if (await write()) landed(sent);
      else refused(sent);
    } catch {
      // The host call already surfaced and reported its failure.
      record.write(rosterSaveMark(record.read(), key, true));
    }
  };
  const { name, color, brief } = patch;
  if (name !== undefined) {
    await step({ name }, async () => {
      const renamed = await host.rename(id, name);
      if (renamed) id = renamed.id;
      return renamed !== null;
    });
  }
  if (color !== undefined) {
    await step({ color }, () => host.recolor(id, color).then(() => true));
  }
  if (brief !== undefined) {
    await step({ brief }, () => host.rebrief(id, brief).then(() => true));
  }
}

function hiredMember(
  record: RosterRecord,
  key: string,
): { member: RosterMember; id: string } | null {
  const member = record.read().find((m) => m.key === key);
  return member?.status.kind === "hired"
    ? { member, id: member.status.id }
    : null;
}
