import { committedUploadFileSchema } from "@houston/wire-types";
import type { UploadFile } from "./commit";

/** Staged entries use the wire parser; inline entries retain the base64 cap. */
export function parseUploadFiles(
  raw: unknown[],
  maxBytes: number,
  fail: (status: number, message: string) => Error,
): UploadFile[] {
  let total = 0;
  return raw.map((value, i) => {
    if (typeof value !== "object" || value === null)
      throw fail(400, `file[${i}] must be an object`);
    if ("uploadId" in value) {
      const parsed = committedUploadFileSchema.safeParse(value);
      if (!parsed.success)
        throw fail(400, `file[${i}] is an invalid staged upload`);
      return parsed.data;
    }
    if (
      !("name" in value) ||
      typeof value.name !== "string" ||
      !("contentBase64" in value) ||
      typeof value.contentBase64 !== "string"
    )
      throw fail(400, `file[${i}] needs string 'name' and 'contentBase64'`);
    const relPath = "relPath" in value ? value.relPath : undefined;
    if (relPath !== undefined && typeof relPath !== "string")
      throw fail(400, `file[${i}] 'relPath' must be a string`);
    // Semantic decoded-size limit (base64 is ~3/4 the byte size). The raw body
    // is already capped DURING draining by readJson(MAX_UPLOAD_BODY_BYTES) — the
    // OOM guard — so this estimate is now purely the user-facing size limit, not
    // the memory backstop it used to (wrongly) stand in for.
    // base64 is ~4/3 the byte size; estimate to fail oversized uploads loudly.
    total += Math.floor((value.contentBase64.length * 3) / 4);
    if (total > maxBytes) throw fail(413, "upload exceeds the size limit");
    return { name: value.name, contentBase64: value.contentBase64, relPath };
  });
}
