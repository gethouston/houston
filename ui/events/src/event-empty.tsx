import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";

export interface EventEmptyProps {
  /** @deprecated use `description` instead */
  message?: string;
  title?: string;
  description?: string;
}

export function EventEmpty({
  title = "No events",
  description,
  message,
}: EventEmptyProps) {
  const body =
    description ??
    message ??
    "Heartbeats, cron jobs, and channel messages will appear here as they happen.";
  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
