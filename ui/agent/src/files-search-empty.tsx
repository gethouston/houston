/**
 * Search-with-no-results state, shown by both views in place of the listing.
 * It names the query back to the user and offers the one way out of it, so a
 * dead search is never a dead end.
 */
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { SearchX } from "lucide-react";

export function FilesSearchEmpty({
  message,
  query,
  clearLabel,
  onClear,
}: {
  message: string;
  /** What the user typed, echoed back so the miss is explicable. */
  query: string;
  clearLabel: string;
  onClear: () => void;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium tracking-normal">
          {message}
        </EmptyTitle>
        <EmptyDescription>“{query}”</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
