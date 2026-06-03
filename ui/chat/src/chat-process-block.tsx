import { useEffect, useMemo, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDownIcon } from "lucide-react";
import { ChatStatusLine } from "./chat-status-line";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./ai-elements/reasoning";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import { ToolsAndCards } from "./chat-helpers";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatProcessSegment } from "./chat-process-groups";

export interface ChatProcessLabels {
  active?: string;
  complete?: string;
}

export interface ChatProcessBlockProps {
  segments: ChatProcessSegment[];
  isActive: boolean;
  labels?: ChatProcessLabels;
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  getThinkingMessage?: ReasoningTriggerProps["getThinkingMessage"];
}

const DEFAULT_LABELS: Required<ChatProcessLabels> = {
  active: "Mission in progress...",
  complete: "Mission log",
};

export function ChatProcessBlock({
  segments,
  isActive,
  labels,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  getThinkingMessage,
}: ChatProcessBlockProps) {
  const l = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
  const [isOpen, setIsOpen] = useState(isActive);
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (isActive) {
      setIsOpen(true);
    } else if (wasActiveRef.current) {
      setIsOpen(false);
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  return (
    <Collapsible
      className="not-prose"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <CollapsibleTrigger
        className="inline-flex max-w-full items-center gap-1.5 text-muted-foreground/65 transition-colors hover:text-muted-foreground"
      >
        <ChatStatusLine label={isActive ? l.active : l.complete} active={isActive} />
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "mt-3 space-y-3 text-sm text-muted-foreground outline-none",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2",
          "data-[state=open]:slide-in-from-top-2",
          "data-[state=closed]:animate-out data-[state=open]:animate-in",
        )}
      >
        {segments.map((segment, index) => {
          const isLastSegment = index === segments.length - 1;
          const segmentActive = isActive && isLastSegment;
          return (
            <div key={segment.key} className="space-y-3">
              {segment.reasoning && (
                <Reasoning
                  isStreaming={segmentActive && segment.reasoning.isStreaming}
                  defaultOpen={segmentActive && segment.reasoning.isStreaming}
                >
                  <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
                  <ReasoningContent>{segment.reasoning.content}</ReasoningContent>
                </Reasoning>
              )}
              {segment.tools.length > 0 && (
                <ToolsAndCards
                  tools={segment.tools}
                  isStreaming={segmentActive}
                  toolLabels={toolLabels}
                  isSpecialTool={isSpecialTool}
                  renderToolResult={renderToolResult}
                />
              )}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
