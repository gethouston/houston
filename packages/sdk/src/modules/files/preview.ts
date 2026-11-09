import {
  type Capabilities,
  FilePreviewError,
  OFFICE_EXTENSIONS,
} from "@houston/wire-types";
import type { Clock } from "../../ports";

export function previewPlan(
  fileName: string,
  capabilities: Pick<Capabilities, "officePreview"> | null,
): "pdf" | "bytes" {
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  return capabilities?.officePreview === true &&
    OFFICE_EXTENSIONS.some((candidate) => candidate === ext)
    ? "pdf"
    : "bytes";
}

export type PreviewRefusal =
  | { fallback: false; error: unknown }
  | { fallback: true; report: false; retryable: false }
  | {
      fallback: true;
      report: true;
      retryable: boolean;
      quiet: "office_preview_capacity" | null;
      error: FilePreviewError;
    };

export function classifyPreviewRefusal(
  error: unknown,
  capabilities: Pick<Capabilities, "officePreview"> | null,
): PreviewRefusal {
  if (!(error instanceof FilePreviewError)) return { fallback: false, error };
  const capacity =
    error.code === "conversion_unavailable" && error.retryAfterMs !== undefined;
  const report =
    error.code === "conversion_unavailable"
      ? capacity || capabilities?.officePreview === true
      : error.code !== "unsupported_type" && error.code !== "too_large";
  return report
    ? {
        fallback: true,
        report: true,
        retryable: capacity,
        quiet: capacity ? "office_preview_capacity" : null,
        error,
      }
    : { fallback: true, report: false, retryable: false };
}

export async function loadPreview<T>(
  download: () => Promise<T>,
  clock: Clock,
): Promise<T> {
  const started = clock.now();
  for (let retries = 0; ; retries++) {
    try {
      return await download();
    } catch (error) {
      const refusal = classifyPreviewRefusal(error, { officePreview: true });
      const retryAfterMs =
        refusal.fallback && refusal.report && refusal.retryable
          ? refusal.error.retryAfterMs
          : undefined;
      if (
        retryAfterMs === undefined ||
        retries === 2 ||
        clock.now() - started + retryAfterMs > 5000
      )
        throw error;
      await new Promise<void>((resolve) =>
        clock.setTimeout(resolve, retryAfterMs),
      );
    }
  }
}
