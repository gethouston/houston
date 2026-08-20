"use client";

import { Button, cn, ScrollArea, ScrollBar } from "@houston-ai/core";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { useHorizontalWheelScroll } from "./horizontal-wheel-scroll";

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => {
  const rootRef = useHorizontalWheelScroll<HTMLDivElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  return (
    <ScrollArea
      className="w-full min-w-0 overflow-x-auto whitespace-nowrap"
      ref={rootRef}
      {...props}
    >
      <div
        className={cn("flex w-max flex-nowrap items-center gap-2", className)}
      >
        {children}
      </div>
      <ScrollBar className="hidden" orientation="horizontal" />
    </ScrollArea>
  );
};

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = useCallback(() => {
    onClick?.(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
