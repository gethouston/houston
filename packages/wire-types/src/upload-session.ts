import { z } from "zod";

/**
 * Resumable uploads (HOU-201). A file too large for one request reaches
 * storage in three steps, so no server in the path holds the whole file:
 *
 *  1. Open: `POST /agents/:agentId/uploads` with {@link OpenUploadRequest}
 *     answers an {@link UploadSession}. Behind the cloud gateway the gateway
 *     answers it and `uploadUrl` is a storage session URL; on a desktop or
 *     self-hosted host the host answers it and `uploadUrl` is its own sink,
 *     possibly relative to the host's base URL.
 *  2. Upload: `PUT uploadUrl` in `chunkBytes` slices with `Content-Range`.
 *     The client never sends its Houston credentials there: the URL itself
 *     is the grant. Every sink speaks the storage resumable protocol,
 *     including the no-308 mode below.
 *  3. Commit: the existing `attachments`, `files/import` and
 *     `migration/import` routes take the `uploadId` where they took bytes.
 */

/** What the staged bytes will become, checked again at commit. */
export const UPLOAD_PURPOSES = [
  "attachment",
  "files_import",
  "migration_import",
] as const;
export const uploadPurposeSchema = z.enum(UPLOAD_PURPOSES);
export type UploadPurpose = z.infer<typeof uploadPurposeSchema>;

/** Per-file cap, the same one the composer and Files tab enforce. */
export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

/**
 * Files at or below this size keep the single-request base64 routes (they
 * batch, so a folder of small files stays a handful of requests); larger
 * files go through a session.
 */
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;

/** Storage requires every non-final chunk to be a multiple of 256 KiB. */
export const UPLOAD_CHUNK_GRANULE_BYTES = 256 * 1024;

export const openUploadRequestSchema = z.object({
  name: z.string().min(1).max(1024),
  size: z.number().int().positive().max(MAX_UPLOAD_FILE_BYTES),
  purpose: uploadPurposeSchema,
});
export type OpenUploadRequest = z.infer<typeof openUploadRequestSchema>;

/** Opaque, unguessable, and safe in a URL path segment and a storage key. */
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

/**
 * Coded refusals from the open and commit steps:
 *  - `upload_too_large` (413): `size` is over {@link MAX_UPLOAD_FILE_BYTES}.
 *  - `too_many_uploads` (429, `Retry-After`): the person has too many open
 *    sessions; retry after the header's delay.
 *  - `upload_not_found` (404): at commit, no finished upload with this id
 *    belongs to this person, agent and purpose (never staged, expired, or
 *    someone else's). The client opens a new session and uploads again.
 *  - `upload_incomplete` (409): at commit, the staged object is missing
 *    bytes. The client resumes the session, then commits again.
 */
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

/**
 * A browser `fetch` treats a bare 308 as a redirect it may follow or hide, so
 * the client sends this header and every sink answers an incomplete upload
 * with 200 plus {@link UPLOAD_STATUS_OVERRIDE_HEADER}: `308` instead. Storage
 * honors it natively; the host and gateway sinks copy it.
 */
export const UPLOAD_NO_308_HEADER = "X-GUploader-No-308";
export const UPLOAD_STATUS_OVERRIDE_HEADER = "X-HTTP-Status-Code-Override";

/** `Content-Range` for the chunk `[start, endExclusive)` of a `total`-byte file. */
export function chunkContentRange(
  start: number,
  endExclusive: number,
  total: number,
): string {
  return `bytes ${start}-${endExclusive - 1}/${total}`;
}

/** `Content-Range` of an empty status query: "how much do you have?". */
export function statusQueryContentRange(total: number): string {
  return `bytes */${total}`;
}

/**
 * Bytes the sink has persisted, read off an incomplete answer's `Range`
 * header (`bytes=0-N` means N + 1 bytes). No header means none; anything else
 * is unreadable and returns null, which a client treats as "query again".
 */
export function persistedBytesFromRange(header: string | null): number | null {
  if (header === null || header === "") return 0;
  const match = /^bytes=0-(\d+)$/.exec(header.trim());
  return match ? Number(match[1]) + 1 : null;
}

/**
 * One file entry at commit: `uploadId` in place of `contentBase64`. The
 * cloud gateway verifies the staged object and adds `stagedGeneration`
 * (replacing any value a client sent) before the request reaches a host;
 * a host that sees it copies that exact generation from the staging bucket.
 * A host that sees no `stagedGeneration` reads its own local staging.
 */
export const committedUploadFileSchema = z.object({
  name: z.string().min(1),
  relPath: z.string().optional(),
  uploadId: uploadIdSchema,
  stagedGeneration: z.string().regex(/^\d+$/).optional(),
});
export type CommittedUploadFile = z.infer<typeof committedUploadFileSchema>;

/** `migration/import` body (`Content-Type: application/json`) in place of a raw zip. */
export const migrationImportCommitSchema = z.object({
  uploadId: uploadIdSchema,
  stagedGeneration: z.string().regex(/^\d+$/).optional(),
});
export type MigrationImportCommit = z.infer<typeof migrationImportCommitSchema>;
