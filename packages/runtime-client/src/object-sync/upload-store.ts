/** Exact-generation operations on uploads outside the agent's object prefix. */
export interface UploadStore {
  copyUpload(
    uploadId: string,
    key: string,
    generation: string,
  ): Promise<CopiedUpload>;
  readUpload(uploadId: string, generation: string): Promise<Buffer>;
}
export interface CopiedUpload {
  key: string;
  generation: string;
  size: number;
}
export function parseCopiedUpload(body: unknown, key: string): CopiedUpload {
  if (
    typeof body !== "object" ||
    body === null ||
    !("key" in body) ||
    body.key !== key ||
    !("generation" in body) ||
    typeof body.generation !== "string" ||
    !/^\d+$/.test(body.generation) ||
    !("size" in body) ||
    typeof body.size !== "number" ||
    !Number.isSafeInteger(body.size) ||
    body.size < 0
  )
    throw new Error("object store upload copy returned a malformed body");
  return { key, generation: body.generation, size: body.size };
}
export function isUploadStore(store: object): store is UploadStore {
  return (
    "copyUpload" in store &&
    typeof store.copyUpload === "function" &&
    "readUpload" in store &&
    typeof store.readUpload === "function"
  );
}

export class UploadCopyExistsError extends Error {
  readonly status = 409;
  readonly code = "exists";
  constructor(readonly key: string) {
    super(`upload destination already exists: ${key}`);
  }
}
