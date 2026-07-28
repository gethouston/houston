import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import type { Agent, SkillSummary } from "../../lib/types";
import { ChooseChatAgentDialog } from "./choose-chat-agent-dialog";
import { GlobalSkillChat } from "./global-skill-chat";

/**
 * The global page's create-with-AI entry (HOU-792): "New skill" picks the
 * agent that hosts the guided chat (skipped straight to the chat when the
 * workspace has exactly one), then mounts {@link GlobalSkillChat} keyed per
 * open so every click starts a FRESH draft — the chat renders in the shell's
 * right panel while the page stays on the left.
 */
export function useGlobalChatFlow(opts: {
  agents: Agent[];
  listsByPath: Map<string, SkillSummary[] | undefined>;
  /** The chat's "Edit manually" — opens the global manage dialog. */
  onEditSkill: (slug: string) => void;
}): { node: ReactNode; startCreate: () => void } {
  const { agents, listsByPath, onEditSkill } = opts;
  const [chat, setChat] = useState<{ agent: Agent; nonce: number } | null>(
    null,
  );
  const [pickOpen, setPickOpen] = useState(false);
  const nonceRef = useRef(0);

  const openFor = useCallback((agent: Agent) => {
    nonceRef.current += 1;
    setChat({ agent, nonce: nonceRef.current });
  }, []);

  const startCreate = useCallback(() => {
    if (agents.length === 0) return;
    if (agents.length === 1) openFor(agents[0]);
    else setPickOpen(true);
  }, [agents, openFor]);

  const close = useCallback(() => setChat(null), []);

  const node = (
    <>
      {chat && (
        <GlobalSkillChat
          key={`${chat.agent.id}:${chat.nonce}`}
          agent={chat.agent}
          skills={listsByPath.get(chat.agent.folderPath)}
          onClose={close}
          onEditSkill={onEditSkill}
        />
      )}
      <ChooseChatAgentDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        agents={agents}
        onPick={openFor}
      />
    </>
  );

  return { node, startCreate };
}
