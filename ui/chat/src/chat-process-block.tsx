import { useEffect, useMemo, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  HoustonHelmet,
  cn,
} from "@houston-ai/core";
import { ChevronDownIcon } from "lucide-react";
import { Shimmer } from "./ai-elements/shimmer";
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
  renderPendingTool?: ToolsAndCardsProps["renderPendingTool"];
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
  renderPendingTool,
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
        className="inline-flex max-w-full items-center gap-1.5 text-xs text-muted-foreground/65 transition-colors hover:text-muted-foreground"
      >
        <HoustonHelmet color="currentColor" size={13} />
        <span className="min-w-0 truncate text-left">
          {isActive ? <Shimmer duration={1}>{l.active}</Shimmer> : l.complete}
        </span>
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
                  renderPendingTool={renderPendingTool}
                />
              )}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
