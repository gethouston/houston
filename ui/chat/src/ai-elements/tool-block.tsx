/**
 * ToolBlock — collapsible tool call display (AI Element).
 *
 * Visually identical to Reasoning: same Collapsible, same trigger layout,
 * same animations. The only differences are the icon (tool-specific instead
 * of BrainIcon) and the label text.
 *
 * - Auto-opens when the tool is active (running, no result yet)
 * - Auto-collapses ~800ms after the result arrives
 * - Shimmer animation while active (matches "Thinking..." treatment)
 *
 * Exception: Bash. The terminal output is noisy and most users don't want
 * to read shell stdout, so Bash blocks stay collapsed by default. Click the
 * chevron to inspect.
 */

"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@houston-ai/core";
import { ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { ToolEntry } from "../feed-to-messages";
import { getToolIcon, getToolDetail, ToolContent } from "../tool-formatters";
import { Shimmer } from "./shimmer";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const ACTIVE_LABELS: Record<string, string> = {
  Read: "Reading file",
  Write: "Writing file",
  Edit: "Editing file",
  Bash: "Running command",
  Glob: "Searching files",
  Grep: "Searching code",
  WebSearch: "Searching the web",
  WebFetch: "Fetching page",
  ToolSearch: "Looking up tools",
  Agent: "Delegating task",
};

const DONE_LABELS: Record<string, string> = {
  Read: "Read file",
  Write: "Wrote file",
  Edit: "Edited file",
  Bash: "Ran command",
  Glob: "Searched files",
  Grep: "Searched code",
  WebSearch: "Searched the web",
  WebFetch: "Fetched page",
  ToolSearch: "Looked up tools",
  Agent: "Delegated task",
};

function getLabel(
  name: string,
  done: boolean,
  custom?: Record<string, string>,
): string {
  const short = name.includes("__") ? name.split("__").pop()! : name;
  if (custom?.[short]) return custom[short];
  const map = done ? DONE_LABELS : ACTIVE_LABELS;
  return map[short] || short.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// ToolBlock
// ---------------------------------------------------------------------------

const AUTO_CLOSE_DELAY = 800;

export interface ToolBlockProps {
  tool: ToolEntry;
  /** True when this is the currently executing tool. */
  isActive: boolean;
  toolLabels?: Record<string, string>;
}

export const ToolBlock = memo(
  ({ tool, isActive, toolLabels }: ToolBlockProps) => {
    // Bash output is shell stdout — opt out of the auto-open-while-active
    // behavior so the chat stays clean. The user can still click to expand.
    const shortName = tool.name.includes("__")
      ? tool.name.split("__").pop()!
      : tool.name;
    const autoOpenWhileActive = shortName !== "Bash";

    const [isOpen, setIsOpen] = useState(autoOpenWhileActive && isActive);
    const wasActiveRef = useRef(isActive);
    const hasAutoClosedRef = useRef(false);

    // Auto-open when becoming active (unless this tool opted out).
    useEffect(() => {
      if (!autoOpenWhileActive) return;
      if (isActive && !wasActiveRef.current) {
        setIsOpen(true);
        hasAutoClosedRef.current = false;
      }
      wasActiveRef.current = isActive;
    }, [isActive, autoOpenWhileActive]);

    // Auto-close after result arrives
    useEffect(() => {
      if (tool.result && !isActive && isOpen && !hasAutoClosedRef.current) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          hasAutoClosedRef.current = true;
        }, AUTO_CLOSE_DELAY);
        return () => clearTimeout(timer);
      }
    }, [tool.result, isActive, isOpen]);

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
      if (!open) hasAutoClosedRef.current = true;
    }, []);

    const Icon = getToolIcon(tool.name);
    const detail = getToolDetail(tool.name, tool.input);
    const isDone = !!tool.result;

    return (
      <Collapsible
        className="not-prose"
        open={isOpen}
        onOpenChange={handleOpenChange}
      >
        <CollapsibleTrigger className="flex w-full items-start gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
          <Icon className="size-4 mt-0.5 shrink-0" />
          {isActive ? (
            <Shimmer duration={1}>
              {`${getLabel(tool.name, false, toolLabels)}...`}
            </Shimmer>
          ) : (
            <p className="min-w-0 truncate">
              {getLabel(tool.name, isDone, toolLabels)}
              {detail && (
                <span className="text-muted-foreground/50"> — {detail}</span>
              )}
            </p>
          )}
          <ChevronDownIcon
            className={cn(
              "size-4 mt-0.5 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            "mt-4 text-sm",
            "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2",
            "data-[state=open]:slide-in-from-top-2",
            "text-muted-foreground outline-none",
            "data-[state=closed]:animate-out data-[state=open]:animate-in",
          )}
        >
          <ToolContent tool={tool} />
        </CollapsibleContent>
      </Collapsible>
    );
  },
);
ToolBlock.displayName = "ToolBlock";
