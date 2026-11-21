import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDownIcon, GlobeIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "./ai-elements/reasoning";
import { ChatActionBrandLine } from "./chat-action-brand-line";
import type { ToolsAndCardsProps } from "./chat-helpers";
import { ToolsAndCards } from "./chat-helpers";
import { processScrollPaneClass } from "./chat-process-classes";
import type { ChatProcessSegment } from "./chat-process-groups";
import type { ChatProcessLabels } from "./chat-process-header";
import { buildProcessHeader } from "./chat-process-header";
import { ChatStatusLine } from "./chat-status-line";
import type { CommandActivity } from "./command-activity";
import { PythonIcon } from "./python-icon";
import { getMappedToolIcon } from "./tool-formatters";

export type { ChatActionBrand, ChatProcessLabels } from "./chat-process-header";

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
  const [isOpen, setIsOpen] = useState(false);

  const header = useMemo(
    () => buildProcessHeader({ isActive, segments, labels, toolLabels }),
    [isActive, segments, labels, toolLabels],
  );

  const { scrollRef, contentRef } = useStickToBottom({
    initial: isActive ? "instant" : false,
    resize: "smooth",
  });

  return (
    <Collapsible className="not-prose" open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="inline-flex max-w-full items-center gap-1.5 text-ink-muted/65 transition-colors hover:text-ink-muted">
        {header.kind === "brand" ? (
          <ChatActionBrandLine
            active={isActive}
            brand={header.brand}
            count={header.count}
          />
        ) : header.kind === "activity" ? (
          <ChatStatusLine
            active={isActive}
            icon={renderActivityIcon(header.activity.kind)}
            label={header.label}
          />
        ) : header.kind === "tool" ? (
          <ChatStatusLine
            active={isActive}
            icon={renderToolIcon(header.toolName)}
            label={header.label}
          />
        ) : (
          <ChatStatusLine label={header.label} active={isActive} />
        )}
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

function renderToolIcon(toolName: string) {
  const Icon = getMappedToolIcon(toolName);
  return Icon ? <Icon className="size-3.5 shrink-0" /> : undefined;
}

function renderActivityIcon(kind: CommandActivity["kind"]) {
  return kind === "web" ? (
    <GlobeIcon className="size-3.5 shrink-0" />
  ) : (
    <PythonIcon className="size-3.5 shrink-0" />
  );
}
