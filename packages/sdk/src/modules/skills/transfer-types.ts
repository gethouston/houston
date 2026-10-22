/** Failures that leave both the workspace skill and any employee copy intact. */
export type SkillTransferRefusal =
  | "workspace_not_owned"
  | "enabled_elsewhere"
  | "local_copy_exists"
  | "skill_changed"
  | "agent_not_in_workspace";

export class SkillTransferRefusalError extends Error {
  constructor(readonly reason: SkillTransferRefusal) {
    super(reason);
    this.name = "SkillTransferRefusalError";
  }
}

export const SkillTransferCommand = {
  KeepForAgent: "skills/keepSharedSkillForAgent",
  ShareNew: "skills/shareNewSkillToWorkspace",
} as const;

export type SkillShareResult =
  | { outcome: "shared"; creatorEnabled: true; localDeleted: boolean }
  | { outcome: "kept-local" }
  | { outcome: "skipped" };

/** The app refreshes its merged list before the employee copy disappears. */
export interface SkillShareHooks {
  beforeDelete?(): Promise<void>;
}
