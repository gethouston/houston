import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";

/**
 * The two whole-skill acts that exist only inside ONE AI Employee's Skills
 * section: stop this employee loading a workspace skill, and — where the
 * employee keeps its own copy of one — drop that copy and follow the workspace
 * version again. The library scope has neither: it stands on no employee.
 *
 * It also answers the question those acts hang off — which copy of the skill
 * the editor below writes to — because the same three inputs decide both.
 *
 * Kept free of React and of the reporting path so the rules and the run are
 * both testable on their own; {@link ./use-scoped-skill-acts} is what binds
 * them to a screen.
 */

/** True when this employee runs its OWN copy of a workspace skill. */
function isScopedOverride(row: ManagedSkillRow, scopedAgent: Agent): boolean {
  return (
    row.origin === "local" &&
    (row.overriddenBy ?? []).some((a) => a.id === scopedAgent.id)
  );
}

/** Which version of a workspace skill the scoped editor is writing to. */
export type ScopedSkillNotice = "override" | "workspace";

/** Which of the two acts a control runs. */
export type ScopedActKind = "disable" | "revert";

export interface ScopedSkillAct {
  kind: ScopedActKind;
  /** The store write, already bound to this skill and this employee. */
  run: () => Promise<void>;
  /** The name a failure of it is reported under. */
  command: string;
  /**
   * The act deletes the copy this employee wrote for itself, which nothing
   * restores, so the screen asks before it runs. False where the employee
   * simply loads the workspace version: there the act is a manifest write,
   * reversible by enabling the skill again.
   */
  destroysOwnVersion: boolean;
}

export interface ScopedSkillActions {
  /** Stop this employee loading the workspace skill. Undefined in the library
   *  scope, and for a skill that lives on this employee alone. */
  disable?: ScopedSkillAct;
  /** Drop this employee's shadowing copy. Undefined unless it has one. */
  revert?: ScopedSkillAct;
  /** What the editor below is really editing, or null where the question does
   *  not arise (the library, or a skill this employee alone has). */
  notice: ScopedSkillNotice | null;
}

export function scopedSkillActions(args: {
  row: ManagedSkillRow;
  scopedAgent: Agent | null;
  shared: SharedDialogActions | undefined;
  /** The open row IS the store's copy — a workspace skill this employee loads
   *  unchanged, rather than one it has shadowed. */
  isShared: boolean;
}): ScopedSkillActions {
  const { row, scopedAgent, shared, isShared } = args;
  if (scopedAgent === null || shared === undefined) return { notice: null };
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

/** What one act's run reads and moves on the screen that started it. */
export interface ScopedActDeps {
  /** False once the editor the act was started from has left the screen. */
  isLive: () => boolean;
  /** True while an act is already writing; a second press does nothing. */
  isPending: () => boolean;
  setPending: (pending: boolean) => void;
  /** Back to the list, once the skill has left this employee. */
  onBack: () => void;
  report: (command: string, err: unknown) => void;
}

/**
 * Run one scoped act, bound to the editor that started it.
 *
 * Both acts change WHICH copy the open editor writes to, so both leave it —
 * but only while that editor is still the one on screen. The user can press
 * Back and start editing another skill while the write is in flight, and the
 * way out is shared: taken then, it would throw that skill's typed draft away.
 */
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
