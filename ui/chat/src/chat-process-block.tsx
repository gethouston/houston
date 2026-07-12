import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./ai-elements/reasoning";
import type { ToolsAndCardsProps } from "./chat-helpers";
import { ToolsAndCards } from "./chat-helpers";
import { processScrollPaneClass } from "./chat-process-classes";
import type { ChatProcessSegment } from "./chat-process-groups";
import type { ChatProcessLabels } from "./chat-process-header";
import { buildProcessHeaderLabel } from "./chat-process-header";
import { ChatStatusLine } from "./chat-status-line";

export type { ChatProcessLabels } from "./chat-process-header";

export interface ChatProcessBlockProps {
  segments: ChatProcessSegment[];
  isActive: boolean;
  labels?: ChatProcessLabels;
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  getThinkingMessage?: ReasoningTriggerProps["getThinkingMessage"];
}

export function ChatProcessBlock({
  segments,
  isActive,
  labels,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  getThinkingMessage,
}: ChatProcessBlockProps) {
  // HOU-448: the log is hidden by default and the user clicks the chevron to
  // reveal it. We never auto-open while the agent works (the header alone shows
  // the one action in progress) and never auto-close when it settles, so a
  // manual open stays open for the life of the mounted block.
  const [isOpen, setIsOpen] = useState(false);

  // The single trigger line. While active it surfaces only the one in-progress
  // action ("Mission in progress: Reading file"); settled it reads "Mission
  // log". Never a count of how many tool calls ran.
  const headerLabel = useMemo(
    () => buildProcessHeaderLabel({ isActive, segments, labels, toolLabels }),
    [isActive, segments, labels, toolLabels],
  );

  // Once the user opens the (now closed-by-default) pane during an active run,
  // tool calls keep streaming in; pin the latest into view inside the
  // height-capped pane so the live step stays visible without the list
  // swallowing the conversation (HOU-426 — the cap is the sole guard now that
  // the pane is opened on demand rather than auto-opened). The hook releases
  // the lock the moment the user scrolls up, and a settled log starts at the
  // top instead of jumping.
  const { scrollRef, contentRef } = useStickToBottom({
    initial: isActive ? "instant" : false,
    resize: "smooth",
  });

  return (
    <Collapsible className="not-prose" open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="inline-flex max-w-full items-center gap-1.5 text-ink-muted/65 transition-colors hover:text-ink-muted">
        <ChatStatusLine label={headerLabel} active={isActive} />
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            isOpen ? "rotate-180" : "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "mt-3 text-sm text-ink-muted outline-none",
          "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2",
          "data-[state=open]:slide-in-from-top-2",
          "data-[state=closed]:animate-out data-[state=open]:animate-in",
        )}
      >
        <div ref={scrollRef} className={processScrollPaneClass}>
          <div ref={contentRef} className="space-y-3">
            {segments.map((segment, index) => {
              const isLastSegment = index === segments.length - 1;
              const segmentActive = isActive && isLastSegment;
              return (
                <div key={segment.key} className="space-y-3">
                  {segment.reasoning && (
                    <Reasoning
                      isStreaming={
                        segmentActive && segment.reasoning.isStreaming
                      }
                      defaultOpen={
                        segmentActive && segment.reasoning.isStreaming
                      }
                    >
                      <ReasoningTrigger
                        getThinkingMessage={getThinkingMessage}
                      />
                      <ReasoningContent>
                        {segment.reasoning.content}
                      </ReasoningContent>
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
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
