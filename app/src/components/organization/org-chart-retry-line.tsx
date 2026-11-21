import { Button, cn } from "@houston-ai/core";

export function OrgChartRetryLine({
  message,
  retryLabel,
  onRetry,
  className,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-2 text-sm text-ink-muted",
        className,
      )}
    >
      {message}
      <Button variant="link" size="xs" className="px-0" onClick={onRetry}>
        {retryLabel}
      </Button>
    </p>
  );
}
