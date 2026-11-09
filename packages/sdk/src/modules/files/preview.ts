import {
  type Capabilities,
  FilePreviewError,
  OFFICE_EXTENSIONS,
} from "@houston/wire-types";

export function previewPlan(
  fileName: string,
  capabilities: Pick<Capabilities, "officePreview"> | null,
): "pdf" | "bytes" {
  const ext = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase()
    : undefined;
  return capabilities?.officePreview &&
    OFFICE_EXTENSIONS.some((candidate) => candidate === ext)
    ? "pdf"
    : "bytes";
}

export function classifyPreviewRefusal(
  error: unknown,
  capabilities: Pick<Capabilities, "officePreview"> | null,
):
  | { fallback: true; report: false }
  | { fallback: true; report: true; error: FilePreviewError } {
  if (!(error instanceof FilePreviewError)) {
    return {
      fallback: true,
      report: true,
      error: new FilePreviewError(
        "conversion_failed",
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
      ),
    };
  }
  const report =
    error.code === "conversion_unavailable"
      ? capabilities?.officePreview === true
      : error.code !== "unsupported_type" && error.code !== "too_large";
  return report
    ? { fallback: true, report: true, error }
    : { fallback: true, report: false };
}
