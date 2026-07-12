import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  ScrollArea,
} from "@houston-ai/core";
import { Check, ChevronDown, Circle, Loader2 } from "lucide-react";
import { useState } from "react";
import { feedItemsToMessages } from "./feed-to-messages";
import type { FeedItem } from "./types";
import { useProgressSteps } from "./use-progress-steps";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SidebarStep {
  title: string;
  status: "pending" | "active" | "done";
}

export interface ChatSidebarProps {
  /** Progress steps to display (explicit). */
  progressSteps?: SidebarStep[];
  /** Feed items for extracting tool-based progress (used if progressSteps not provided). */
  feedItems?: FeedItem[];
  /** Additional className. */
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  ChatSidebar                                                        */
/* ------------------------------------------------------------------ */

export function ChatSidebar({
  progressSteps,
  feedItems = [],
  className,
}: ChatSidebarProps) {
  return (
    <div className={cn("w-[260px] flex flex-col gap-3", className)}>
      <ProgressCard progressSteps={progressSteps} feedItems={feedItems} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress Card                                                      */
/* ------------------------------------------------------------------ */

function ProgressCard({
  progressSteps,
  feedItems,
}: {
  progressSteps?: SidebarStep[];
  feedItems: FeedItem[];
}) {
  const [open, setOpen] = useState(true);
  const hookSteps = useProgressSteps(feedItems);
  const toolSteps = useToolSteps(feedItems);
  const steps = progressSteps ?? (hookSteps.length > 0 ? hookSteps : toolSteps);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-line bg-card shadow-sm">
        <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium">
          Progress
          <ChevronDown
            className={cn(
              "size-4 text-ink-muted transition-transform",
              !open && "-rotate-90",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-3">
            {steps.length === 0 ? (
              <p className="text-xs text-ink-muted py-1">
                Progress will appear when the agent starts working
              </p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-0.5">
                  {steps.map((step, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: SidebarStep has no stable id; steps derive from tool-call order and are never reordered
                    <StepRow key={i} step={step} />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Step row                                                           */
/* ------------------------------------------------------------------ */

function StepRow({ step }: { step: SidebarStep }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className="mt-0.5 shrink-0">
        {step.status === "done" && (
          <div className="size-4 rounded-full bg-[#00a240] flex items-center justify-center">
            <Check className="size-2.5 text-white" strokeWidth={3} />
          </div>
        )}
        {step.status === "active" && (
          <Loader2
            className="size-4 text-ink/60 animate-spin"
            strokeWidth={1.5}
          />
        )}
        {step.status === "pending" && (
          <Circle className="size-4 text-ink-muted/25" strokeWidth={1.5} />
        )}
      </div>
      <span
        className={cn(
          "text-xs leading-snug",
          step.status === "done" && "text-ink/50",
          step.status === "active" && "text-ink font-medium",
          step.status === "pending" && "text-ink/60",
        )}
      >
        {step.title}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool-step extraction                                               */
/* ------------------------------------------------------------------ */

const TOOL_LABELS: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Bash: "Running command",
  Glob: "Searching files",
  Grep: "Searching code",
  WebSearch: "Searching the web",
  WebFetch: "Fetching page",
};

function useToolSteps(feedItems: FeedItem[]): SidebarStep[] {
  const messages = feedItemsToMessages(feedItems);
  const allTools = messages.flatMap((m) => m.tools);
  if (allTools.length === 0) return [];

  const steps: SidebarStep[] = [];
  for (const tool of allTools) {
    const name = tool.name.includes("__")
      ? (tool.name.split("__").pop() ?? tool.name)
      : tool.name;
    const label = TOOL_LABELS[name] || name.replace(/_/g, " ");
    const last = steps[steps.length - 1];
    if (last && last.title === label) continue;
    steps.push({
      title: label,
      status: tool.result ? "done" : "active",
    });
  }
  return steps;
}
