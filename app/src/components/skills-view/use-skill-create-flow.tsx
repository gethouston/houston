import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import type { Agent, SkillSummary } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { type SkillChatIntent, SkillChatPane } from "./skill-chat-pane";

export function useSkillCreateFlow(opts: {
  agent: Agent;
  skillsByPath: ReadonlyMap<string, SkillSummary[] | undefined>;
  skillsFailed: boolean;
  onEditSkill: (slug: string) => void;
}): {
  node: ReactNode;
  startChat: () => void;
  openDraft: (activityId: string) => void;
  openForSkill: (row: WorkspaceSkillRow) => void;
  close: () => void;
  open: boolean;
  openActivityId: string | null;
} {
  const { agent, skillsByPath, skillsFailed, onEditSkill } = opts;
  const [chat, setChat] = useState<{
    agent: Agent;
    initial: SkillChatIntent;
    nonce: number;
  } | null>(null);
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const nonceRef = useRef(0);

  const openChat = useCallback((agent: Agent, initial: SkillChatIntent) => {
    nonceRef.current += 1;
    setChat({ agent, initial, nonce: nonceRef.current });
  }, []);

  const startChat = useCallback(
    () => openChat(agent, { kind: "create", allowResume: true }),
    [agent, openChat],
  );

  const openDraft = useCallback(
    (activityId: string) => openChat(agent, { kind: "draft", activityId }),
    [agent, openChat],
  );

  const openForSkill = useCallback(
    (row: WorkspaceSkillRow) =>
      openChat(agent, { kind: "skill", slug: row.slug }),
    [agent, openChat],
  );

  const close = useCallback(() => setChat(null), []);

  const node = chat ? (
    <SkillChatPane
      key={`${chat.agent.id}:${chat.nonce}`}
      agent={chat.agent}
      skills={skillsByPath.get(chat.agent.folderPath)}
      skillsFailed={skillsFailed}
      initial={chat.initial}
      onClose={close}
      onEditSkill={onEditSkill}
      onOpenActivityChange={setOpenActivityId}
    />
  ) : null;

  return {
    node,
    startChat,
    openDraft,
    openForSkill,
    close,
    open: chat !== null,
    openActivityId,
  };
}
