import { z } from "zod";

export const UPLOAD_PURPOSES = [
  "attachment",
  "files_import",
  "migration_import",
] as const;
export const uploadPurposeSchema = z.enum(UPLOAD_PURPOSES);
export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;

export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;

export const UPLOAD_CHUNK_GRANULE_BYTES = 256 * 1024;

export const openUploadRequestSchema = z.object({
  name: z.string().min(1).max(1024),
  size: z.number().int().positive().max(MAX_UPLOAD_FILE_BYTES),
  purpose: uploadPurposeSchema,
});
export type OpenUploadRequest = z.infer<typeof openUploadRequestSchema>;

export const uploadIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export const uploadSessionSchema = z.object({
  uploadId: uploadIdSchema,
  uploadUrl: z.string().min(1),
  chunkBytes: z
    .number()
    .int()
    .positive()
    .refine((n) => n % UPLOAD_CHUNK_GRANULE_BYTES === 0),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type UploadSession = z.infer<typeof uploadSessionSchema>;

export function parseUploadSession(body: unknown): UploadSession | null {
  const result = uploadSessionSchema.safeParse(body);
  return result.success ? result.data : null;
}

export const uploadRefusalCodeSchema = z.enum([
  "upload_too_large",
  "too_many_uploads",
  "upload_not_found",
  "upload_incomplete",
]);
export type UploadRefusalCode = z.infer<typeof uploadRefusalCodeSchema>;

export const UPLOAD_REFUSAL_STATUS = {
  upload_too_large: 413,
  too_many_uploads: 429,
  upload_not_found: 404,
  upload_incomplete: 409,
} satisfies Record<UploadRefusalCode, number>;

export const uploadRefusalSchema = z.object({
  error: z.string(),
  code: uploadRefusalCodeSchema,
});
export type UploadRefusal = z.infer<typeof uploadRefusalSchema>;

export function parseUploadRefusal(body: unknown): UploadRefusal | null {
  const result = uploadRefusalSchema.safeParse(body);
  return result.success ? result.data : null;
}

export const UPLOAD_NO_308_HEADER = "X-GUploader-No-308";
export const UPLOAD_STATUS_OVERRIDE_HEADER = "X-HTTP-Status-Code-Override";

export function chunkContentRange(
  start: number,
  endExclusive: number,
  total: number,
): string {
  return `bytes ${start}-${endExclusive - 1}/${total}`;
}

export function statusQueryContentRange(total: number): string {
  return `bytes */${total}`;
}

export function persistedBytesFromRange(header: string | null): number | null {
  if (header === null || header === "") return 0;
  const match = /^bytes=0-(\d+)$/.exec(header.trim());
  return match ? Number(match[1]) + 1 : null;
}

export const committedUploadFileSchema = z.object({
  name: z.string().min(1),
  relPath: z.string().optional(),
  uploadId: uploadIdSchema,
  stagedGeneration: z.string().regex(/^\d+$/).optional(),
});
export type CommittedUploadFile = z.infer<typeof committedUploadFileSchema>;

export const migrationImportCommitSchema = z.object({
  uploadId: uploadIdSchema,
  stagedGeneration: z.string().regex(/^\d+$/).optional(),
});
export type MigrationImportCommit = z.infer<typeof migrationImportCommitSchema>;
