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
