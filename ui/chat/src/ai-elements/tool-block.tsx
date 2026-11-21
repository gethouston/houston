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
import {
  getToolDetail,
  getToolEntryIcon,
  ToolContent,
} from "../tool-formatters";
import { getToolActionLabel, toolShortName } from "../tool-labels";
import { Shimmer } from "./shimmer";

const AUTO_CLOSE_DELAY = 800;

export interface ToolBlockProps {
  tool: ToolEntry;
  isActive: boolean;
  toolLabels?: Record<string, string>;
}

export const ToolBlock = memo(
  ({ tool, isActive, toolLabels }: ToolBlockProps) => {
    const autoOpenWhileActive =
      toolShortName(tool.name).toLowerCase() !== "bash";

    const initialAutoOpen = autoOpenWhileActive && isActive;
    const [isOpen, setIsOpen] = useState(initialAutoOpen);
    const wasActiveRef = useRef(isActive);
    const autoOpenedRef = useRef(initialAutoOpen);

    useEffect(() => {
      if (!autoOpenWhileActive) return;
      if (isActive && !wasActiveRef.current) {
        setIsOpen(true);
        autoOpenedRef.current = true;
      }
      wasActiveRef.current = isActive;
    }, [isActive, autoOpenWhileActive]);

    useEffect(() => {
      if (tool.result && !isActive && isOpen && autoOpenedRef.current) {
        const timer = setTimeout(() => {
          setIsOpen(false);
          autoOpenedRef.current = false;
        }, AUTO_CLOSE_DELAY);
        return () => clearTimeout(timer);
      }
    }, [tool.result, isActive, isOpen]);

    const handleOpenChange = useCallback((open: boolean) => {
      setIsOpen(open);
      autoOpenedRef.current = false;
    }, []);

    const Icon = getToolEntryIcon(tool);
    const detail = getToolDetail(tool.name, tool.input);
    const isDone = !!tool.result;

    return (
      <Collapsible
        className="not-prose"
        open={isOpen}
        onOpenChange={handleOpenChange}
      >
        <CollapsibleTrigger className="flex w-full items-start gap-2 text-ink-muted text-sm transition-colors hover:text-ink">
          <Icon className="size-4 mt-0.5 shrink-0" />
          {isActive ? (
            <Shimmer duration={1}>
              {`${getToolActionLabel(tool.name, false, toolLabels)}...`}
            </Shimmer>
          ) : (
            <p className="min-w-0 truncate">
              {getToolActionLabel(tool.name, isDone, toolLabels)}
              {detail && <span className="text-ink-muted/50"> — {detail}</span>}
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
            "text-ink-muted outline-none",
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
