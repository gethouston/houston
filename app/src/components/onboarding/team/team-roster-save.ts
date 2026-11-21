import type { AgentRoleContext } from "../../../lib/agent-role-context.ts";
import {
  type RosterPatch,
  rosterRevert,
  rosterSaved,
  rosterSaveMark,
  rosterUnsaved,
} from "./team-roster-edit.ts";
import type { RosterMember } from "./team-roster-model.ts";

export interface RosterSaveHost {
  whenReady: (id: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<{ id: string } | null>;
  recolor: (id: string, color: string) => Promise<void>;
  rebrief: (id: string, brief: AgentRoleContext) => Promise<void>;
}

export interface RosterRecord {
  read: () => readonly RosterMember[];
  write: (next: RosterMember[]) => void;
}

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
  const member = hiredMember(record, key);
  if (!member) return;
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
