import {
  resolveCreateChatStart,
  resolveDraftResume,
} from "@houston/sdk/skill-drafts";
import { useEffect, useRef, useState } from "react";

/** What a mount of the Skills chat opens. */
export type SkillChatIntent =
  | {
      kind: "create";
      /** Whether an unfinished chat may be picked back up instead — true only
       *  where the surface draws rows for those chats. */
      allowResume: boolean;
    }
  | { kind: "draft"; activityId: string }
  | { kind: "skill"; slug: string };

/**
 * Open what this mount was asked for, exactly once.
 *
 * A skill's chat opens on the spot. The two that read the unfinished chats
 * first — "Create with chat" ({@link resolveCreateChatStart}) and one named
 * unfinished chat ({@link resolveDraftResume}) — are only worth anything on
 * settled data, so they wait for it; while they wait the pane stands on its
 * calm opening surface instead of nothing. A named chat the settled read no
 * longer calls unfinished has nothing to reopen, and the pane closes rather
 * than holding on a conversation about to disappear.
 */
export function useSkillChatOpen(args: {
  initial: SkillChatIntent;
  /** True once the employee's chats AND skills are real, settled data. */
  settled: boolean;
  /** True once one of those reads failed. */
  failed: boolean;
  drafts: readonly { id: string; updated_at?: string }[];
  openSkillChat: (slug: string) => void;
  resumeDraft: (activityId: string) => void;
  startCreate: () => void;
  /** The chat a row named is not unfinished any more — there is nothing for
   *  this mount to show. */
  onMissingDraft: () => void;
}): { deciding: boolean } {
  const {
    initial,
    settled,
    failed,
    drafts,
    openSkillChat,
    resumeDraft,
    startCreate,
    onMissingDraft,
  } = args;
  const startedRef = useRef(false);
  const [deciding, setDeciding] = useState(initial.kind !== "skill");

  useEffect(() => {
    if (startedRef.current) return;
    if (initial.kind === "skill") {
      startedRef.current = true;
      openSkillChat(initial.slug);
      return;
    }
    if (initial.kind === "draft") {
      const resume = resolveDraftResume({
        settled,
        failed,
        activityId: initial.activityId,
        drafts,
      });
      if (resume.kind === "wait") return;
      startedRef.current = true;
      setDeciding(false);
      if (resume.kind === "resume") resumeDraft(resume.activityId);
      else onMissingDraft();
      return;
    }
    const start = resolveCreateChatStart({
      allowResume: initial.allowResume,
      settled,
      failed,
      drafts,
    });
    if (start.kind === "wait") return;
    startedRef.current = true;
    setDeciding(false);
    if (start.kind === "resume") resumeDraft(start.activityId);
    else startCreate();
  }, [
    initial,
    settled,
    failed,
    drafts,
    openSkillChat,
    resumeDraft,
    startCreate,
    onMissingDraft,
  ]);

  return { deciding };
}
