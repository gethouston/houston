// Chat view — live session against the engine over the tunnel.
//
// The outer container is pinned to the visual viewport (height +
// offsetTop) so iOS Safari's URL bar + keyboard don't shift the
// header off screen. Header sticks to the top, composer to the
// bottom, messages scroll between them.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChatPanel,
  UserAttachmentMessage,
  decodeSkillMessage,
  decodeAttachmentMessage,
  type FeedItem,
} from "@houston-ai/chat";
import {
  useChatHistory,
  useCreateMission,
  useSendMessage,
} from "../hooks/use-chat";
import {
  useAllConversations,
  useCurrentWorkspace,
} from "../hooks/use-conversations";
import { useAgents } from "../hooks/use-agents";
import { useVisualViewport } from "../hooks/use-keyboard-height";
import { ChatHeader } from "./chat-header";
import { UserSkillMessage } from "./user-skill-message";

export function ChatView() {
  const nav = useNavigate();
  const { sessionKey } = useParams<{ sessionKey: string }>();
  const [params] = useSearchParams();
  const agentPath = params.get("agent") ?? "";

  // Draft mode: NewMissionSheet hands us a `draft-<uuid>` key so the
  // composer is available without an activity existing on the engine
  // yet. The activity (and therefore the desktop board row) is only
  // created on the first real send. Bail before sending = no server
  // state, no orphan.
  const isDraft = sessionKey?.startsWith("draft-") ?? false;
  // When draft, skip history fetch + per-session WS subscribe.
  const querySessionKey = isDraft ? null : (sessionKey ?? null);

  const ws = useCurrentWorkspace();
  const { data: agents } = useAgents(ws?.id ?? null);
  const { data: conversations } = useAllConversations();
  const convo = conversations?.find((c) => c.session_key === sessionKey);
  const agent = agents?.find((a) => a.folderPath === agentPath);

  // Single source of truth for "agent is working": server activity
  // status. Optimistic client flags would linger past completion.
  const isRunning = convo?.status === "running";

  const sendMutation = useSendMessage(agentPath, querySessionKey ?? "");
  const createMission = useCreateMission(agentPath);
  const { data: history } = useChatHistory(agentPath, querySessionKey, {
    isActive: isRunning,
  });
  const [sendError, setSendError] = useState<string | null>(null);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSendError(null);
      if (!isDraft) {
        sendMutation.mutate(trimmed, {
          onError: (e) => setSendError(sendErrorMessage(e)),
        });
        return;
      }
      if (!agentPath || createMission.isPending) return;
      try {
        const { sessionKey: newKey } = await createMission.mutateAsync(trimmed);
        nav(
          `/session/${encodeURIComponent(newKey)}?agent=${encodeURIComponent(agentPath)}`,
          { replace: true },
        );
      } catch (e) {
        console.error("[chat-view] draft send failed", e);
        setSendError(sendErrorMessage(e));
      }
    },
    [isDraft, sendMutation, createMission, agentPath, nav],
  );

  // Scroll the message list to the bottom when the route changes —
  // so arriving at an existing session lands on the latest message.
  useEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight });
  }, [sessionKey]);

  const vv = useVisualViewport();
  const feedItems = (history ?? []) as unknown as FeedItem[];

  return (
    <div
      className="mobile-chat fixed left-0 right-0 flex flex-col bg-background"
      style={{
        top: `${vv.offsetTop}px`,
        height: `${vv.height}px`,
      }}
    >
      <ChatHeader
        convo={convo}
        agent={agent}
        agentPath={agentPath}
        isDraft={isDraft}
        isRunning={isRunning}
        onBack={() => nav("/")}
      />

      <div className="flex-1 min-h-0 flex flex-col">
        <ChatPanel
          sessionKey={sessionKey ?? "default"}
          feedItems={feedItems}
          onSend={handleSend}
          isLoading={sendMutation.isPending || createMission.isPending}
          placeholder="Message…"
          composerHeader={
            sendError ? (
              <div className="mx-3 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {sendError}
              </div>
            ) : undefined
          }
          renderUserMessage={(msg) => {
            const invocation = decodeSkillMessage(msg.content);
            if (invocation) return <UserSkillMessage invocation={invocation} />;
            const attachmentInvocation = decodeAttachmentMessage(msg.content);
            if (!attachmentInvocation) return undefined;
            return <UserAttachmentMessage invocation={attachmentInvocation} />;
          }}
        />
      </div>
    </div>
  );
}

function sendErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/conflict/i.test(msg)) {
    return "Another mission is already running for this agent. Try again when it finishes.";
  }
  return "Could not start that mission. Check your Mac and try again.";
}
