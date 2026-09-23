import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent, SkillSummary } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { ChooseAgentDialog } from "./choose-agent-dialog";
import { type SkillChatIntent, SkillChatPane } from "./skill-chat-pane";
import { resolveSkillCreateTarget } from "./skills-scope";

/**
 * The guided create chat, plus the editor's own chat.
 *
 * A skill is built ON one AI Employee, so starting one resolves an employee
 * first ({@link resolveSkillCreateTarget}): the scoped surface already stands
 * on one, the library takes the only one it has, and a library with several
 * asks. {@link SkillChatPane} is keyed per open, so every skill lands on its
 * own conversation.
 */
export function useSkillCreateFlow(opts: {
  /** Every AI Employee in the workspace — who the library may choose from. */
  agents: Agent[];
  /** The employee this surface is scoped to, or null for the library. */
  scopedAgent: Agent | null;
  /** folderPath → every skill that employee RUNS: its own copies plus the
   *  workspace skills it loads. The chat resolves a skill by slug out of this,
   *  so the copies alone would strand a workspace skill's chat on "Opening". */
  skillsByPath: ReadonlyMap<string, SkillSummary[] | undefined>;
  /** Whether reading those skills failed — the chat stops waiting on a list
   *  that never lands. */
  skillsFailed: boolean;
  /** The chat's "Edit manually" — shows the skill's markdown on the left. */
  onEditSkill: (slug: string) => void;
}): {
  node: ReactNode;
  startChat: () => void;
  /** Reopen ONE unfinished creation chat, from the row the scoped list draws
   *  for it. The library draws none, so nothing opens there. */
  openDraft: (activityId: string) => void;
  /** The editor's chat: the skill's own conversation, hosted on its first
   *  holder (the canonical copy's agent). A row with no holder has no agent
   *  to run it on, so nothing opens. */
  openForSkill: (row: WorkspaceSkillRow) => void;
  /** Unmount the chat — the shell panel closes with it. */
  close: () => void;
  /** Whether a chat is mounted right now (the panel is up). */
  open: boolean;
  /** The unclaimed chat the open pane holds, so the list never draws a second
   *  row for it. */
  openActivityId: string | null;
} {
  const { agents, scopedAgent, skillsByPath, skillsFailed, onEditSkill } = opts;
  const { t } = useTranslation("skills");
  const [chat, setChat] = useState<{
    agent: Agent;
    initial: SkillChatIntent;
    nonce: number;
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const nonceRef = useRef(0);

  const openChat = useCallback((agent: Agent, initial: SkillChatIntent) => {
    nonceRef.current += 1;
    setChat({ agent, initial, nonce: nonceRef.current });
  }, []);

  const startChat = useCallback(() => {
    const target = resolveSkillCreateTarget({
      scopedAgentId: scopedAgent?.id ?? null,
      agentIds: agents.map((a) => a.id),
    });
    if (target.kind === "none") return;
    if (target.kind === "choose") {
      setAsking(true);
      return;
    }
    const picked =
      scopedAgent?.id === target.agentId
        ? scopedAgent
        : agents.find((a) => a.id === target.agentId);
    // Only the scoped surface lists the unfinished chats, so only there can a
    // resume be read as anything but landing in a stranger's conversation.
    if (picked)
      openChat(picked, {
        kind: "create",
        allowResume: scopedAgent !== null,
      });
  }, [agents, openChat, scopedAgent]);

  const openDraft = useCallback(
    (activityId: string) => {
      if (scopedAgent) openChat(scopedAgent, { kind: "draft", activityId });
    },
    [openChat, scopedAgent],
  );

  const openForSkill = useCallback(
    (row: WorkspaceSkillRow) => {
      const holder = agents.find((a) => a.id === row.agents[0]?.id);
      if (holder) openChat(holder, { kind: "skill", slug: row.slug });
    },
    [agents, openChat],
  );

  const close = useCallback(() => setChat(null), []);

  const node = (
    <>
      {chat && (
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
      )}
      <ChooseAgentDialog
        open={asking}
        onOpenChange={setAsking}
        agents={agents}
        title={t("global.chatPick.title")}
        description={t("global.chatPick.description")}
        onPick={(agent) => {
          setAsking(false);
          // The library asked WHICH employee; it still lists none of their
          // unfinished chats, so this one starts fresh.
          openChat(agent, { kind: "create", allowResume: false });
        }}
      />
    </>
  );

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
