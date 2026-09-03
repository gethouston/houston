import { AIBoard } from "@houston-ai/board";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useBoardChatWiring } from "../board/use-board-chat-wiring";
import { useMissionChatSource } from "./use-mission-chat-source";

/**
 * The phone's pushed mission-chat screen: chat as a PLACE, a first-class nav
 * level over whatever view pushed it (a board card, an Agents-home mission
 * row, the compose flow), popped by its back chevron or hardware back. The
 * shell mounts it full-screen while the nav entry names it and hides the tab
 * bars — a push, not a tab.
 *
 * The chat itself is the boards' own wiring (`useBoardChatWiring`) over the
 * chat-only source, rendered through AIBoard's panel-only presentation, so
 * this screen can never drift from the desktop panel. The composer stays
 * above the on-screen keyboard by padding the screen with the visual
 * viewport's occluded bottom (`useVisualViewportInset`).
 */
export function MissionChatScreen() {
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const closeMissionChat = useUIStore((s) => s.closeMissionChat);
  const agent = useAgentStore((s) =>
    chatAgentId === null
      ? null
      : (s.agents.find((a) => a.id === chatAgentId) ?? null),
  );

  // A ghost guard, not a render fork: an agent deleted (or a roster reload
  // landing mid-chat) pops the screen instead of stranding a dead chat.
  useEffect(() => {
    if (chatAgentId !== null && agent === null) closeMissionChat();
  }, [chatAgentId, agent, closeMissionChat]);

  if (agent === null) return null;
  return <MissionChatHost agent={agent} />;
}

function MissionChatHost({ agent }: { agent: Agent }) {
  const { t } = useTranslation("shell");
  const missionId = useUIStore((s) => s.chatMissionId);
  const closeMissionChat = useUIStore((s) => s.closeMissionChat);
  const agents = useAgentStore((s) => s.agents);
  const source = useMissionChatSource(agents, agent, missionId);
  const wiring = useBoardChatWiring(source);
  const screenRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportInset(screenRef);

  return (
    <div
      ref={screenRef}
      data-testid="mission-chat-screen"
      className="flex h-full min-h-0 flex-col pb-safe"
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      <AIBoard
        items={source.items}
        selectedId={source.selectedId}
        onSelect={source.setSelectedId}
        onDelete={source.onDelete}
        onApprove={source.onApprove}
        onArchive={source.onArchive}
        onRename={source.onRename}
        panelOnly
        hidePanelClose
        panelLeading={
          <button
            type="button"
            data-testid="mission-chat-back"
            aria-label={t("missionChat.back")}
            onClick={closeMissionChat}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:scale-95 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          >
            <ChevronLeft className="size-5" />
          </button>
        }
        {...wiring.chatProps}
      />
      {wiring.dialogs}
    </div>
  );
}
