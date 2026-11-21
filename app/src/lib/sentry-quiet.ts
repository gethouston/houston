import * as Sentry from "@sentry/browser";

export interface QuietCaptureOptions {
  level: "warning" | "error";
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

export function captureQuietEvent(
  error: Error,
  options: QuietCaptureOptions,
): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, {
    level: options.level,
    fingerprint: options.fingerprint,
    tags: options.tags,
    extra: options.extra,
  });
}
