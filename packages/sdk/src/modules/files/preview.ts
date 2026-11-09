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

export function previewRefusalAction(
  error: unknown,
): "fallback" | "report-and-fallback" | null {
  if (!(error instanceof FilePreviewError)) return null;
  return error.code === "timeout" || error.code === "conversion_failed"
    ? "report-and-fallback"
    : "fallback";
}
