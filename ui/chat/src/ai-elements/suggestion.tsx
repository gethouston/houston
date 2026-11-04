"use client";

import { Button, cn } from "@houston-ai/core";
import type { ComponentProps } from "react";
import { useCallback } from "react";

export type SuggestionsProps = ComponentProps<"div">;

/** The chips wrap onto more lines instead of scrolling sideways: a hidden
 *  horizontal scroll cut the last chip mid-word with no sign there was more. */
export const Suggestions = ({ className, ...props }: SuggestionsProps) => (
  <div
    className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
    {...props}
  />
);

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
      className={cn(
        "cursor-pointer rounded-full px-4 active:scale-[0.96] md:active:scale-100",
        // A label wider than the row wraps inside its chip instead of
        // overflowing it.
        "h-auto min-h-8 max-w-full whitespace-normal py-1.5 text-left leading-snug",
        className,
      )}
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
