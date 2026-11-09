import { z } from "zod";

export const OFFICE_EXTENSIONS = [
  "pptx",
  "docx",
  "xlsx",
  "ppt",
  "doc",
  "xls",
  "odp",
  "odt",
  "ods",
] as const;
export type OfficeExtension = (typeof OFFICE_EXTENSIONS)[number];
export const officeExtensionSchema = z.enum(OFFICE_EXTENSIONS);
export const filePreviewRefusalCodeSchema = z.enum([
  "unsupported_type",
  "too_large",
  "conversion_unavailable",
  "timeout",
  "conversion_failed",
]);
export type FilePreviewRefusalCode = z.infer<
  typeof filePreviewRefusalCodeSchema
>;
export const filePreviewRefusalSchema = z.object({
  error: z.string(),
  code: filePreviewRefusalCodeSchema,
});
export type FilePreviewRefusal = z.infer<typeof filePreviewRefusalSchema>;
export function parseFilePreviewRefusal(
  body: unknown,
): FilePreviewRefusal | null {
  const result = filePreviewRefusalSchema.safeParse(body);
  return result.success ? result.data : null;
}

export class FilePreviewError extends Error {
  constructor(
    readonly code: FilePreviewRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = "FilePreviewError";
  }
}

export const FILE_PREVIEW_STATUS = {
  unsupported_type: 415,
  too_large: 413,
  conversion_unavailable: 503,
  timeout: 504,
  conversion_failed: 422,
} satisfies Record<FilePreviewRefusalCode, number>;
export interface FilePreviewOptions {
  as: "pdf";
  lang: string;
}

export const OFFICE_MAX_BYTES = 50 * 1024 * 1024;

export const officeConverterHealthSchema = z.object({
  status: z.literal("ok"),
  version: z.string().min(1),
});
export const officePdfMetadataSchema = z.object({
  pageCount: z.number().int().positive(),
  version: z.string().min(1),
});
