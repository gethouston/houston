import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { Agent, ConversationEntry } from "@houston-ai/engine-client";
import { ArrowLeft } from "lucide-react";

interface ChatHeaderProps {
  convo: ConversationEntry | undefined;
  agent: Agent | undefined;
  agentPath: string;
  isDraft: boolean;
  isRunning: boolean;
  onBack: () => void;
}

export function ChatHeader({
  convo,
  agent,
  agentPath,
  isDraft,
  isRunning,
  onBack,
}: ChatHeaderProps) {
  const title = isDraft
    ? (agent?.name ?? "New mission")
    : (convo?.title ?? agent?.name ?? "Session");
  const subtitle = isDraft
    ? "Type a message to start"
    : (agent?.name ?? agentPath);

  return (
    <header
      className="shrink-0 flex items-center gap-3 border-b border-border/80 bg-background/95 backdrop-blur px-3 py-2"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <button
        type="button"
        onClick={onBack}
        className="touchable h-9 w-9 flex items-center justify-center rounded-full hover:bg-accent -ml-1"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <HoustonAvatar
        color={resolveAgentColor(agent?.color)}
        diameter={36}
        running={isRunning}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        {isRunning ? (
          <p className="truncate text-[11px] text-muted-foreground leading-tight italic flex items-center gap-1">
            typing
            <span className="inline-flex items-end h-2 gap-[2px] ml-0.5">
              <span className="typing-dot inline-block size-[3px] rounded-full bg-current" />
              <span className="typing-dot inline-block size-[3px] rounded-full bg-current" />
              <span className="typing-dot inline-block size-[3px] rounded-full bg-current" />
            </span>
          </p>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground leading-tight">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}
