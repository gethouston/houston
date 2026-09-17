import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import type { Agent, SkillSummary } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { ChooseChatAgentDialog } from "./choose-chat-agent-dialog";
import { GlobalSkillChat } from "./global-skill-chat";

/**
 * The global page's chat host: "New skill" picks the agent that runs the
 * guided create chat (skipped straight to the chat when the workspace has
 * exactly one), and opening a skill's editor runs that skill's own chat the
 * same way. {@link GlobalSkillChat} is keyed per open, so every click starts
 * a FRESH draft and every skill lands on its own conversation — the chat
 * renders in the shell's right panel while the page stays on the left.
 */
export function useGlobalChatFlow(opts: {
  agents: Agent[];
  listsByPath: Map<string, SkillSummary[] | undefined>;
  /** The chat's "Edit manually" — shows the skill's markdown on the left. */
  onEditSkill: (slug: string) => void;
}): {
  node: ReactNode;
  startCreate: () => void;
  /** The editor's chat: the skill's own conversation, hosted on its first
   *  holder (the canonical copy's agent). A row with no holder has no agent
   *  to run it on, so nothing opens. */
  openForSkill: (row: WorkspaceSkillRow) => void;
  /** Unmount the chat — the shell panel closes with it. */
  close: () => void;
  /** Whether a chat is mounted right now (the panel is up). */
  open: boolean;
} {
  const { agents, listsByPath, onEditSkill } = opts;
  const [chat, setChat] = useState<{
    agent: Agent;
    initial: { kind: "create" } | { kind: "skill"; slug: string };
    nonce: number;
  } | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const nonceRef = useRef(0);

  const openFor = useCallback(
    (
      agent: Agent,
      initial: { kind: "create" } | { kind: "skill"; slug: string } = {
        kind: "create",
      },
    ) => {
      nonceRef.current += 1;
      setChat({ agent, initial, nonce: nonceRef.current });
    },
    [],
  );

  const startCreate = useCallback(() => {
    if (agents.length === 0) return;
    if (agents.length === 1) openFor(agents[0]);
    else setPickOpen(true);
  }, [agents, openFor]);

  const openForSkill = useCallback(
    (row: WorkspaceSkillRow) => {
      const holder = agents.find((a) => a.id === row.agents[0]?.id);
      if (holder) openFor(holder, { kind: "skill", slug: row.slug });
    },
    [agents, openFor],
  );

  const close = useCallback(() => setChat(null), []);

  const node = (
    <>
      {chat && (
        <GlobalSkillChat
          key={`${chat.agent.id}:${chat.nonce}`}
          agent={chat.agent}
          skills={listsByPath.get(chat.agent.folderPath)}
          initial={chat.initial}
          onClose={close}
          onEditSkill={onEditSkill}
        />
      )}
      <ChooseChatAgentDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        agents={agents}
        onPick={(agent) => openFor(agent)}
      />
    </>
  );

  return { node, startCreate, openForSkill, close, open: chat !== null };
}
