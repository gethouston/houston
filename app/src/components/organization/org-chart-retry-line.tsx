import { Button, cn } from "@houston-ai/core";

/**
 * A read the org chart could not make, said once in a quiet line with the way
 * to try it again. Both failures the chart can hit wear it — the teams the
 * cards are drawn from, and the usage the numbers come from — so a broken read
 * never degrades into a claim about the company ("No teams yet", "0 people").
 */
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
