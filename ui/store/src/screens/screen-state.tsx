"use client";

import { Button, Skeleton } from "@houston-ai/core";

export function StoreScreenLoading() {
  return (
    <div
      aria-hidden
      className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <Skeleton key={item} className="h-60 rounded-2xl" />
      ))}
    </div>
  );
}

export function StoreScreenError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3 py-16">
      <p className="text-center text-sm text-ink-muted">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="rounded-full" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
