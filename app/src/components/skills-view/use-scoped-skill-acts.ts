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

export interface ScopedSkillControls {
  disableHere?: () => void;
  useWorkspaceVersion?: () => void;
  notice: ScopedSkillNotice | null;
  pending: boolean;
  confirming: ScopedActKind | null;
  onCancelConfirm: () => void;
  onConfirm: () => Promise<void>;
}

export function useScopedSkillActs(args: {
  row: ManagedSkillRow;
  scopedAgent: Agent;
  shared: SharedDialogActions | undefined;
  isShared: boolean;
  guard: (run: () => void) => void;
  onBack: () => void;
}): ScopedSkillControls {
  const { guard, onBack } = args;
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<ScopedSkillAct | null>(null);
  const pendingRef = useRef(false);
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
