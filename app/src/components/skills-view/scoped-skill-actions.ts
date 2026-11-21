import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";

function isScopedOverride(row: ManagedSkillRow, scopedAgent: Agent): boolean {
  return (
    row.origin === "local" &&
    (row.overriddenBy ?? []).some((a) => a.id === scopedAgent.id)
  );
}

export type ScopedSkillNotice = "override" | "workspace";

export type ScopedActKind = "disable" | "revert";

export interface ScopedSkillAct {
  kind: ScopedActKind;
  run: () => Promise<void>;
  command: string;
  destroysOwnVersion: boolean;
}

export interface ScopedSkillActions {
  disable?: ScopedSkillAct;
  revert?: ScopedSkillAct;
  notice: ScopedSkillNotice | null;
}

export function scopedSkillActions(args: {
  row: ManagedSkillRow;
  scopedAgent: Agent;
  shared: SharedDialogActions | undefined;
  isShared: boolean;
}): ScopedSkillActions {
  const { row, scopedAgent, shared, isShared } = args;
  if (shared === undefined) return { notice: null };
  const override = isScopedOverride(row, scopedAgent);
  if (!(isShared || override)) return { notice: null };
  const asShared = row as SharedSkillRow;
  return {
    disable: {
      kind: "disable",
      run: () => shared.onDisableForAgent(asShared, scopedAgent),
      command: "skill_disable_for_agent",
      destroysOwnVersion: override,
    },
    revert: override
      ? {
          kind: "revert",
          run: () => shared.onRevert(asShared, scopedAgent),
          command: "skill_revert_override",
          destroysOwnVersion: true,
        }
      : undefined,
    notice: override ? "override" : "workspace",
  };
}

export interface ScopedActDeps {
  isLive: () => boolean;
  isPending: () => boolean;
  setPending: (pending: boolean) => void;
  onBack: () => void;
  report: (command: string, err: unknown) => void;
}

export async function runScopedAct(
  act: ScopedSkillAct,
  deps: ScopedActDeps,
): Promise<void> {
  if (deps.isPending()) return;
  deps.setPending(true);
  try {
    await act.run();
    if (deps.isLive()) deps.onBack();
  } catch (err) {
    deps.report(act.command, err);
  } finally {
    if (deps.isLive()) deps.setPending(false);
  }
}
