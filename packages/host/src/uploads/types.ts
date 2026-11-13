import type { UploadPurpose, UploadRefusalCode } from "@houston/wire-types";
import { UPLOAD_REFUSAL_STATUS } from "@houston/wire-types";

export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export interface UploadIdentity {
  agentId: string;
  workspace: string;
  owner: string;
  purpose: UploadPurpose;
}
export interface UploadMeta extends UploadIdentity {
  name: string;
  size: number;
  createdAt: number;
}
export class UploadError extends Error {
  readonly status: number;
  constructor(readonly code: UploadRefusalCode) {
    super(code);
    this.status = UPLOAD_REFUSAL_STATUS[code];
  }
}
