import { cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { BASE_INDENT, DEPTH_INDENT, TRIANGLE_AREA } from "./files-list-chrome";

export function RowIndent({
  depth,
  chevron,
}: {
  depth: number;
  chevron?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="h-full shrink-0"
      style={{
        width:
          BASE_INDENT + depth * DEPTH_INDENT + (chevron ? TRIANGLE_AREA : 0),
      }}
    />
  );
}

export function DisclosureChevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-4 shrink-0 text-ink-muted transition-transform duration-150",
        open && "rotate-90",
        className,
      )}
    />
  );
}
