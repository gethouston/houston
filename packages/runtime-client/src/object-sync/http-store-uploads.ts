import { objectStoreResponseError } from "./http-store-errors";
import {
  type CopiedUpload,
  parseCopiedUpload,
  UploadCopyExistsError,
  type UploadStore,
} from "./upload-store";

export class HttpUploadStore implements UploadStore {
  constructor(
    private readonly opts: {
      baseUrl: string;
      request(
        url: string,
        init?: RequestInit,
        extra?: { retryable: boolean },
      ): Promise<Response>;
      authHeaders(): Record<string, string>;
      writeHeaders(): Record<string, string>;
      capture(response: Response): void;
    },
  ) {}
  async copyUpload(
    uploadId: string,
    key: string,
    generation: string,
  ): Promise<CopiedUpload> {
    const response = await this.opts.request(
      `${this.opts.baseUrl}/uploads/${encodeURIComponent(uploadId)}/copy`,
      {
        method: "POST",
        headers: {
          ...this.opts.writeHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, generation }),
      },
      { retryable: false },
    );
    this.opts.capture(response);
    if (response.status === 409) {
      const body: unknown = await response.clone().json();
      if (
        typeof body === "object" &&
        body !== null &&
        "code" in body &&
        body.code === "exists"
      )
        throw new UploadCopyExistsError(key);
    }
    if (!response.ok)
      throw await objectStoreResponseError(response, "POST", key);
    return parseCopiedUpload(await response.json(), key);
  }
  async readUpload(uploadId: string, generation: string): Promise<Buffer> {
    const response = await this.opts.request(
      `${this.opts.baseUrl}/uploads/${encodeURIComponent(uploadId)}?generation=${encodeURIComponent(generation)}`,
      { headers: this.opts.authHeaders() },
    );
    this.opts.capture(response);
    if (!response.ok)
      throw await objectStoreResponseError(response, "GET", uploadId);
    return Buffer.from(await response.arrayBuffer());
  }
}
