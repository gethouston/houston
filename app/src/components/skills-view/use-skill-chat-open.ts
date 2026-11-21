import {
  resolveCreateChatStart,
  resolveDraftResume,
} from "@houston/sdk/skill-drafts";
import { useEffect, useRef, useState } from "react";

export type SkillChatIntent =
  | {
      kind: "create";
      allowResume: boolean;
    }
  | { kind: "draft"; activityId: string }
  | { kind: "skill"; slug: string };

export function useSkillChatOpen(args: {
  initial: SkillChatIntent;
  settled: boolean;
  failed: boolean;
  drafts: readonly { id: string; updated_at?: string }[];
  openSkillChat: (slug: string) => void;
  resumeDraft: (activityId: string) => void;
  startCreate: () => void;
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
