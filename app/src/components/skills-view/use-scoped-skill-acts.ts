import { useEffect, useRef, useState } from "react";
import { logAndReportError } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import {
  runScopedAct,
  type ScopedActKind,
  type ScopedSkillAct,
  type ScopedSkillNotice,
  scopedSkillActions,
} from "./scoped-skill-actions";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";

/**
 * The two scoped acts as an open editor offers them: which controls exist
 * ({@link scopedSkillActions}), what a press does before the write starts, and
 * what the completion is allowed to move ({@link runScopedAct}).
 *
 * An act that deletes this employee's own version of the skill asks first. The
 * dirty-draft confirm is not that question — its copy is about unsaved text,
 * and "Disable for this AI Employee" reads as something a second press undoes,
 * so the version the employee wrote for itself would go with no warning at
 * all. Where nothing of the employee's own is lost, the draft confirm stands
 * alone and a clean editor leaves straight away.
 */
export interface ScopedSkillControls {
  /** More actions > "Disable for this AI Employee". */
  disableHere?: () => void;
  /** The override notice's "Use workspace version". */
  useWorkspaceVersion?: () => void;
  notice: ScopedSkillNotice | null;
  /** True while either act is writing: both controls stay inert. */
  pending: boolean;
  /** The act waiting on its handshake, or null while none is. */
  confirming: ScopedActKind | null;
  onCancelConfirm: () => void;
  /** Resolves when the confirmed act settles, so the dialog can hold its own
   *  pending state until then. */
  onConfirm: () => Promise<void>;
}

export function useScopedSkillActs(args: {
  row: ManagedSkillRow;
  scopedAgent: Agent | null;
  shared: SharedDialogActions | undefined;
  isShared: boolean;
  /** Run an act that leaves the editor behind the dirty-draft confirm. */
  guard: (run: () => void) => void;
  /** Back to the list, once the skill has left this employee. */
  onBack: () => void;
}): ScopedSkillControls {
  const { guard, onBack } = args;
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<ScopedSkillAct | null>(null);
  // Read by the act itself: two presses in one frame both see the state from
  // before the first re-render.
  const pendingRef = useRef(false);
  // The editor is mounted per skill, so unmounting is also how the open skill
  // changes under a write that is still in flight.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const perform = (act: ScopedSkillAct) =>
    runScopedAct(act, {
      isLive: () => live.current,
      isPending: () => pendingRef.current,
      setPending: (next) => {
        pendingRef.current = next;
        setPending(next);
      },
      onBack,
      report: logAndReportError,
    });

  const press = (act: ScopedSkillAct) => () => {
    if (act.destroysOwnVersion) setConfirming(act);
    else guard(() => void perform(act));
  };

  const acts = scopedSkillActions(args);
  return {
    disableHere: acts.disable && press(acts.disable),
    useWorkspaceVersion: acts.revert && press(acts.revert),
    notice: acts.notice,
    pending,
    confirming: confirming?.kind ?? null,
    onCancelConfirm: () => setConfirming(null),
    onConfirm: async () => {
      if (confirming !== null) await perform(confirming);
    },
  };
}
